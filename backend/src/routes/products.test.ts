import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../server.js';
import { initializeDatabase } from '../database.js';
import type Database from 'better-sqlite3';
import express from 'express';
import nacl from 'tweetnacl';
import { canonicalize } from '../crypto/canonicalize.js';
import { computeContentHash } from '../crypto/signature.js';
import http from 'http';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper to make HTTP requests to the Express app.
 */
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

/**
 * Creates and stores a valid attestation directly in the database.
 * Returns the attestation ID and related data.
 */
function storeAttestation(
  db: Database.Database,
  overrides?: Partial<{
    id: string;
    productId: string;
    productName: string;
    supplierId: string;
    location: string;
    materialCost: number;
    labourCost: number;
    isTransformation: boolean;
    outputQuantity: number;
    outputUnit: string;
    timestamp: string;
    inputs: Array<{ attestationId: string; quantityUsed: number; unit: string }>;
  }>
) {
  const keyPair = nacl.sign.keyPair();
  const id = overrides?.id || crypto.randomUUID();
  const productId = overrides?.productId || 'test-product-001';
  const productName = overrides?.productName || 'Test Product';
  const supplierId = overrides?.supplierId || 'supplier-001';
  const location = overrides?.location || 'CA';
  const materialCost = overrides?.materialCost ?? 100.0;
  const labourCost = overrides?.labourCost ?? 50.0;
  const isTransformation = overrides?.isTransformation ?? true;
  const outputQuantity = overrides?.outputQuantity ?? 10;
  const outputUnit = overrides?.outputUnit || 'kg';
  const timestamp = overrides?.timestamp || '2024-01-01T00:00:00Z';
  const inputs = overrides?.inputs || [];

  const payload = {
    productName,
    productId,
    supplierId,
    location,
    materialCost,
    labourCost,
    currency: 'CAD',
    outputQuantity,
    outputUnit,
    timestamp,
    isTransformation,
    inputs,
  };

  const canonicalBytes = canonicalize(payload);
  const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);
  const contentHash = computeContentHash(payload);

  db.prepare(`
    INSERT INTO attestations (
      id, content_hash, supplier_id, public_key, signature, timestamp,
      product_name, product_id, is_transformation, location,
      material_cost, labour_cost, currency, output_quantity, output_unit, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, contentHash, supplierId, bytesToHex(keyPair.publicKey),
    bytesToHex(signature), timestamp, productName, productId,
    isTransformation ? 1 : 0, location, materialCost, labourCost,
    'CAD', outputQuantity, outputUnit, JSON.stringify(payload)
  );

  // Store input references
  for (const input of inputs) {
    db.prepare(
      'INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit) VALUES (?, ?, ?, ?)'
    ).run(id, input.attestationId, input.quantityUsed, input.unit);
  }

  return { id, productId, contentHash, publicKey: bytesToHex(keyPair.publicKey) };
}

describe('GET /products/:id/provenance', () => {
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

  describe('Requirement 2.2 - Product not found', () => {
    it('returns 404 when product ID does not exist', async () => {
      const res = await request(app, 'GET', '/products/non-existent-id/provenance');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('Requirement 2.1 - Full ProvenanceReport', () => {
    it('returns 200 with a complete ProvenanceReport for a valid product', async () => {
      const { productId } = storeAttestation(db, {
        productId: 'prod-report-001',
        location: 'CA',
        materialCost: 100,
        labourCost: 50,
        isTransformation: true,
      });

      const res = await request(app, 'GET', `/products/${productId}/provenance`);

      expect(res.status).toBe(200);
      expect(res.body.productId).toBe(productId);
      expect(res.body.designation).toBeDefined();
      expect(res.body.canadianContentPercent).toBeDefined();
      expect(res.body.totalDirectCosts).toBeDefined();
      expect(res.body.canadianDirectCosts).toBeDefined();
      expect(res.body.lastTransformationLocation).toBeDefined();
      expect(res.body.chain).toBeDefined();
      expect(Array.isArray(res.body.chain)).toBe(true);
      expect(res.body.chainDepth).toBeDefined();
      expect(res.body.allSignaturesValid).toBeDefined();
      expect(res.body.issues).toBeDefined();
      expect(Array.isArray(res.body.issues)).toBe(true);
    });

    it('returns correct Canadian content for a single CA attestation', async () => {
      const { productId } = storeAttestation(db, {
        productId: 'prod-ca-only',
        location: 'CA',
        materialCost: 100,
        labourCost: 50,
        isTransformation: true,
      });

      const res = await request(app, 'GET', `/products/${productId}/provenance`);

      expect(res.status).toBe(200);
      expect(res.body.canadianContentPercent).toBe(100.0);
      expect(res.body.designation).toBe('PRODUCT_OF_CANADA');
      expect(res.body.lastTransformationLocation).toBe('CA');
      expect(res.body.totalDirectCosts).toBe(150);
      expect(res.body.canadianDirectCosts).toBe(150);
    });
  });

  describe('Requirement 2.3 - Signature verification', () => {
    it('sets allSignaturesValid to true when all signatures are valid', async () => {
      const { productId } = storeAttestation(db, {
        productId: 'prod-valid-sig',
        location: 'CA',
        materialCost: 100,
        labourCost: 50,
        isTransformation: true,
      });

      const res = await request(app, 'GET', `/products/${productId}/provenance`);

      expect(res.status).toBe(200);
      expect(res.body.allSignaturesValid).toBe(true);
    });

    it('sets allSignaturesValid to false when a signature is invalid', async () => {
      // Store an attestation with a tampered signature
      const keyPair = nacl.sign.keyPair();
      const id = crypto.randomUUID();
      const productId = 'prod-bad-sig';
      const payload = {
        productName: 'Bad Sig Product',
        productId,
        supplierId: 'supplier-001',
        location: 'CA',
        materialCost: 100,
        labourCost: 50,
        currency: 'CAD',
        outputQuantity: 10,
        outputUnit: 'kg',
        timestamp: '2024-01-01T00:00:00Z',
        isTransformation: true,
        inputs: [],
      };

      const contentHash = computeContentHash(payload);
      // Use a bad signature (valid length but wrong bytes)
      const badSignature = 'ab'.repeat(64);

      db.prepare(`
        INSERT INTO attestations (
          id, content_hash, supplier_id, public_key, signature, timestamp,
          product_name, product_id, is_transformation, location,
          material_cost, labour_cost, currency, output_quantity, output_unit, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, contentHash, 'supplier-001', bytesToHex(keyPair.publicKey),
        badSignature, '2024-01-01T00:00:00Z', 'Bad Sig Product', productId,
        1, 'CA', 100, 50, 'CAD', 10, 'kg', JSON.stringify(payload)
      );

      const res = await request(app, 'GET', `/products/${productId}/provenance`);

      expect(res.status).toBe(200);
      expect(res.body.allSignaturesValid).toBe(false);
    });
  });

  describe('Requirement 2.4 - Anomaly detection on chain', () => {
    it('includes anomaly issues in the response', async () => {
      // Store an attestation with an unregistered supplier (no supplier in registry)
      const { productId } = storeAttestation(db, {
        productId: 'prod-anomaly',
        location: 'CA',
        materialCost: 100,
        labourCost: 50,
        isTransformation: true,
      });

      const res = await request(app, 'GET', `/products/${productId}/provenance`);

      expect(res.status).toBe(200);
      // Should detect UNREGISTERED_SUPPLIER since no suppliers are registered
      const unregisteredIssue = res.body.issues.find(
        (i: any) => i.type === 'UNREGISTERED_SUPPLIER'
      );
      expect(unregisteredIssue).toBeDefined();
    });
  });

  describe('Requirement 2.5 - No transformation steps', () => {
    it('returns designation NONE and lastTransformationLocation null when no transformations', async () => {
      const { productId } = storeAttestation(db, {
        productId: 'prod-no-transform',
        location: 'CA',
        materialCost: 100,
        labourCost: 50,
        isTransformation: false,
      });

      const res = await request(app, 'GET', `/products/${productId}/provenance`);

      expect(res.status).toBe(200);
      expect(res.body.designation).toBe('NONE');
      expect(res.body.lastTransformationLocation).toBeNull();
    });
  });

  describe('Chain with ancestors', () => {
    it('returns the full chain in topological order', async () => {
      // Create a chain: raw material → intermediate → final product
      const raw = storeAttestation(db, {
        id: 'raw-material-001',
        productId: 'prod-chain',
        productName: 'Raw Material',
        location: 'CA',
        materialCost: 50,
        labourCost: 20,
        isTransformation: false,
        timestamp: '2024-01-01T00:00:00Z',
        inputs: [],
      });

      const intermediate = storeAttestation(db, {
        id: 'intermediate-001',
        productId: 'prod-chain',
        productName: 'Intermediate',
        location: 'CA',
        materialCost: 30,
        labourCost: 40,
        isTransformation: true,
        timestamp: '2024-01-02T00:00:00Z',
        inputs: [{ attestationId: 'raw-material-001', quantityUsed: 5, unit: 'kg' }],
      });

      const final = storeAttestation(db, {
        id: 'final-product-001',
        productId: 'prod-chain',
        productName: 'Final Product',
        location: 'CA',
        materialCost: 20,
        labourCost: 60,
        isTransformation: true,
        timestamp: '2024-01-03T00:00:00Z',
        inputs: [{ attestationId: 'intermediate-001', quantityUsed: 3, unit: 'kg' }],
      });

      const res = await request(app, 'GET', `/products/prod-chain/provenance`);

      expect(res.status).toBe(200);
      expect(res.body.chain.length).toBe(3);
      // Topological order: raw material first, final product last
      expect(res.body.chain[0].id).toBe('raw-material-001');
      expect(res.body.chain[2].id).toBe('final-product-001');
      expect(res.body.chainDepth).toBe(3);
      // All CA costs: 50+20+30+40+20+60 = 220
      expect(res.body.totalDirectCosts).toBe(220);
      expect(res.body.canadianDirectCosts).toBe(220);
      expect(res.body.canadianContentPercent).toBe(100.0);
      expect(res.body.designation).toBe('PRODUCT_OF_CANADA');
    });
  });
});
