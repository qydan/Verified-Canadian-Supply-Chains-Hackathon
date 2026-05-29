import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../server.js';
import { initializeDatabase } from '../database.js';
import type Database from 'better-sqlite3';
import express from 'express';
import nacl from 'tweetnacl';
import { canonicalize } from '../crypto/canonicalize.js';
import http from 'http';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function request(
  app: express.Express,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      const options = {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          let parsed: any;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          server.close();
          resolve({ status: res.statusCode!, body: parsed });
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });

      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

function createSignedAttestation(overrides?: Partial<Record<string, any>>) {
  const keyPair = nacl.sign.keyPair();
  const payload = {
    productName: 'Test Product',
    productId: 'prod-001',
    supplierId: 'supplier-001',
    location: 'CA',
    materialCost: 100.0,
    labourCost: 50.0,
    currency: 'CAD',
    outputQuantity: 10,
    outputUnit: 'kg',
    timestamp: '2024-01-01T00:00:00Z',
    isTransformation: true,
    inputs: [],
    ...overrides,
  };

  const canonicalBytes = canonicalize(payload);
  const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

  return {
    payload,
    signature: bytesToHex(signature),
    publicKey: bytesToHex(keyPair.publicKey),
    keyPair,
  };
}

describe('GET /attestations/:id', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeAll(() => {
    db = initializeDatabase(':memory:');
    app = createApp(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM issues');
    db.exec('DELETE FROM input_references');
    db.exec('DELETE FROM attestations');
    db.exec('DELETE FROM suppliers');
  });

  it('returns 404 for non-existent attestation', async () => {
    const res = await request(app, 'GET', '/attestations/non-existent-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns the attestation by ID with all fields', async () => {
    // First create an attestation
    const { payload, signature, publicKey } = createSignedAttestation();
    const createRes = await request(app, 'POST', '/attestations', { payload, signature, publicKey });
    expect(createRes.status).toBe(201);
    const attestationId = createRes.body.id;

    // Now fetch it
    const res = await request(app, 'GET', `/attestations/${attestationId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(attestationId);
    expect(res.body.contentHash).toBe(createRes.body.contentHash);
    expect(res.body.productName).toBe('Test Product');
    expect(res.body.productId).toBe('prod-001');
    expect(res.body.supplierId).toBe('supplier-001');
    expect(res.body.location).toBe('CA');
    expect(res.body.materialCost).toBe(100.0);
    expect(res.body.labourCost).toBe(50.0);
    expect(res.body.isTransformation).toBe(true);
    expect(res.body.outputQuantity).toBe(10);
    expect(res.body.outputUnit).toBe('kg');
    expect(res.body.inputs).toEqual([]);
  });

  it('returns attestation with input references', async () => {
    // Create a raw material attestation
    const { payload: p1, signature: s1, publicKey: pk1 } = createSignedAttestation({
      productId: 'raw-001',
      productName: 'Raw Material',
    });
    const res1 = await request(app, 'POST', '/attestations', { payload: p1, signature: s1, publicKey: pk1 });
    expect(res1.status).toBe(201);
    const rawId = res1.body.id;

    // Create a product that references the raw material
    const keyPair = nacl.sign.keyPair();
    const payload2 = {
      productName: 'Finished Product',
      productId: 'prod-002',
      supplierId: 'supplier-002',
      location: 'CA',
      materialCost: 200.0,
      labourCost: 100.0,
      currency: 'CAD',
      outputQuantity: 5,
      outputUnit: 'kg',
      timestamp: '2024-01-02T00:00:00Z',
      isTransformation: true,
      inputs: [{ attestationId: rawId, quantityUsed: 8, unit: 'kg' }],
    };
    const canonicalBytes = canonicalize(payload2);
    const sig2 = nacl.sign.detached(canonicalBytes, keyPair.secretKey);
    const res2 = await request(app, 'POST', '/attestations', {
      payload: payload2,
      signature: bytesToHex(sig2),
      publicKey: bytesToHex(keyPair.publicKey),
    });
    expect(res2.status).toBe(201);
    const productId = res2.body.id;

    // Fetch the product attestation
    const res = await request(app, 'GET', `/attestations/${productId}`);
    expect(res.status).toBe(200);
    expect(res.body.inputs).toHaveLength(1);
    expect(res.body.inputs[0].attestationId).toBe(rawId);
    expect(res.body.inputs[0].quantityUsed).toBe(8);
    expect(res.body.inputs[0].unit).toBe('kg');
  });
});

describe('POST /verify', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeAll(() => {
    db = initializeDatabase(':memory:');
    app = createApp(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM issues');
    db.exec('DELETE FROM input_references');
    db.exec('DELETE FROM attestations');
    db.exec('DELETE FROM suppliers');
  });

  it('returns 400 when attestationId is missing', async () => {
    const res = await request(app, 'POST', '/verify', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('attestationId');
  });

  it('returns 404 when attestation does not exist', async () => {
    const res = await request(app, 'POST', '/verify', { attestationId: 'non-existent-id' });
    expect(res.status).toBe(404);
  });

  it('returns VerificationResult for a valid single attestation', async () => {
    // Register supplier first so signature is valid
    const keyPair = nacl.sign.keyPair();
    const publicKeyHex = bytesToHex(keyPair.publicKey);
    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-1', 'Test Supplier', publicKeyHex, 'CA', '2024-01-01T00:00:00Z', 1);

    const payload = {
      productName: 'Canadian Widget',
      productId: 'prod-ca-001',
      supplierId: 'sup-1',
      location: 'CA',
      materialCost: 80.0,
      labourCost: 20.0,
      currency: 'CAD',
      outputQuantity: 10,
      outputUnit: 'units',
      timestamp: '2024-01-01T00:00:00Z',
      isTransformation: true,
      inputs: [],
    };
    const canonicalBytes = canonicalize(payload);
    const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const createRes = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(signature),
      publicKey: publicKeyHex,
    });
    expect(createRes.status).toBe(201);
    const attestationId = createRes.body.id;

    // Verify
    const res = await request(app, 'POST', '/verify', { attestationId });
    expect(res.status).toBe(200);
    expect(res.body.attestationId).toBe(attestationId);
    expect(res.body.allSignaturesValid).toBe(true);
    expect(res.body.chain).toHaveLength(1);
    expect(res.body.designation).toBe('PRODUCT_OF_CANADA');
    expect(res.body.canadianContentPercent).toBe(100);
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('returns allSignaturesValid=true for a valid chain', async () => {
    const keyPair = nacl.sign.keyPair();
    const publicKeyHex = bytesToHex(keyPair.publicKey);
    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-1', 'Test Supplier', publicKeyHex, 'CA', '2024-01-01T00:00:00Z', 1);

    // Create raw material
    const rawPayload = {
      productName: 'Raw Material',
      productId: 'raw-001',
      supplierId: 'sup-1',
      location: 'CA',
      materialCost: 50.0,
      labourCost: 10.0,
      currency: 'CAD',
      outputQuantity: 20,
      outputUnit: 'kg',
      timestamp: '2024-01-01T00:00:00Z',
      isTransformation: false,
      inputs: [],
    };
    const rawCanonical = canonicalize(rawPayload);
    const rawSig = nacl.sign.detached(rawCanonical, keyPair.secretKey);
    const rawRes = await request(app, 'POST', '/attestations', {
      payload: rawPayload,
      signature: bytesToHex(rawSig),
      publicKey: publicKeyHex,
    });
    expect(rawRes.status).toBe(201);
    const rawId = rawRes.body.id;

    // Create finished product referencing raw material
    const finishedPayload = {
      productName: 'Finished Product',
      productId: 'prod-fin-001',
      supplierId: 'sup-1',
      location: 'CA',
      materialCost: 100.0,
      labourCost: 50.0,
      currency: 'CAD',
      outputQuantity: 5,
      outputUnit: 'kg',
      timestamp: '2024-01-02T00:00:00Z',
      isTransformation: true,
      inputs: [{ attestationId: rawId, quantityUsed: 15, unit: 'kg' }],
    };
    const finCanonical = canonicalize(finishedPayload);
    const finSig = nacl.sign.detached(finCanonical, keyPair.secretKey);
    const finRes = await request(app, 'POST', '/attestations', {
      payload: finishedPayload,
      signature: bytesToHex(finSig),
      publicKey: publicKeyHex,
    });
    expect(finRes.status).toBe(201);
    const finId = finRes.body.id;

    // Verify the chain
    const res = await request(app, 'POST', '/verify', { attestationId: finId });
    expect(res.status).toBe(200);
    expect(res.body.allSignaturesValid).toBe(true);
    expect(res.body.chain).toHaveLength(2);
    expect(res.body.designation).toBe('PRODUCT_OF_CANADA');
    expect(res.body.canadianContentPercent).toBe(100);
  });

  it('returns correct designation for mixed-location chain', async () => {
    const keyPair = nacl.sign.keyPair();
    const publicKeyHex = bytesToHex(keyPair.publicKey);
    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-1', 'Test Supplier', publicKeyHex, 'CA', '2024-01-01T00:00:00Z', 1);

    // Create US raw material (non-Canadian)
    const usPayload = {
      productName: 'US Material',
      productId: 'us-raw-001',
      supplierId: 'sup-1',
      location: 'US',
      materialCost: 200.0,
      labourCost: 100.0,
      currency: 'CAD',
      outputQuantity: 20,
      outputUnit: 'kg',
      timestamp: '2024-01-01T00:00:00Z',
      isTransformation: false,
      inputs: [],
    };
    const usCanonical = canonicalize(usPayload);
    const usSig = nacl.sign.detached(usCanonical, keyPair.secretKey);
    const usRes = await request(app, 'POST', '/attestations', {
      payload: usPayload,
      signature: bytesToHex(usSig),
      publicKey: publicKeyHex,
    });
    expect(usRes.status).toBe(201);
    const usId = usRes.body.id;

    // Create Canadian finished product referencing US material
    const caPayload = {
      productName: 'Canadian Product',
      productId: 'ca-prod-001',
      supplierId: 'sup-1',
      location: 'CA',
      materialCost: 50.0,
      labourCost: 50.0,
      currency: 'CAD',
      outputQuantity: 5,
      outputUnit: 'kg',
      timestamp: '2024-01-02T00:00:00Z',
      isTransformation: true,
      inputs: [{ attestationId: usId, quantityUsed: 10, unit: 'kg' }],
    };
    const caCanonical = canonicalize(caPayload);
    const caSig = nacl.sign.detached(caCanonical, keyPair.secretKey);
    const caRes = await request(app, 'POST', '/attestations', {
      payload: caPayload,
      signature: bytesToHex(caSig),
      publicKey: publicKeyHex,
    });
    expect(caRes.status).toBe(201);
    const caId = caRes.body.id;

    // Verify - should be NONE since Canadian content is 100/400 = 25%
    const res = await request(app, 'POST', '/verify', { attestationId: caId });
    expect(res.status).toBe(200);
    expect(res.body.canadianContentPercent).toBe(25);
    expect(res.body.designation).toBe('NONE');
  });
});
