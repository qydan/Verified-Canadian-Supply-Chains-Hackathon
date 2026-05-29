/**
 * Edge Case Handling Tests
 *
 * Verifies graceful degradation behavior per Requirements 16.1, 16.2, 16.3:
 * - Missing optional fields → process without crashing
 * - Broken input references → store with BROKEN_LINK issue, don't reject
 * - DAG traversal > 100 levels → truncate with INFO issue
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../server.js';
import { initializeDatabase } from '../database.js';
import { walkAncestors } from '../engine/dag.js';
import type Database from 'better-sqlite3';
import express from 'express';
import nacl from 'tweetnacl';
import { canonicalize } from '../crypto/canonicalize.js';
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
 * Creates a signed attestation request with the given payload fields.
 */
function createSignedAttestation(payloadOverrides?: Record<string, any>) {
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
    ...payloadOverrides,
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

describe('Edge Case Handling - Requirement 16.1: Missing Optional Fields', () => {
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

  it('processes attestation without currency field (optional) without crashing', async () => {
    const keyPair = nacl.sign.keyPair();
    const payload = {
      productName: 'No Currency Product',
      productId: 'prod-no-currency',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 100.0,
      labourCost: 50.0,
      outputQuantity: 10,
      outputUnit: 'kg',
      timestamp: '2024-01-01T00:00:00Z',
      isTransformation: true,
      inputs: [],
      // currency is intentionally omitted
    };

    const canonicalBytes = canonicalize(payload);
    const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(signature),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.contentHash).toBeDefined();
    expect(res.body.contentHash).toHaveLength(64);
  });

  it('processes attestation without inputs field (optional) without crashing', async () => {
    const keyPair = nacl.sign.keyPair();
    const payload = {
      productName: 'No Inputs Product',
      productId: 'prod-no-inputs',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 75.0,
      labourCost: 25.0,
      outputQuantity: 5,
      outputUnit: 'L',
      timestamp: '2024-01-02T00:00:00Z',
      isTransformation: false,
      // inputs is intentionally omitted
    };

    const canonicalBytes = canonicalize(payload);
    const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(signature),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.contentHash).toBeDefined();
  });

  it('processes attestation with both currency and inputs omitted without crashing', async () => {
    const keyPair = nacl.sign.keyPair();
    const payload = {
      productName: 'Minimal Product',
      productId: 'prod-minimal',
      supplierId: 'supplier-001',
      location: 'US',
      materialCost: 200.0,
      labourCost: 100.0,
      outputQuantity: 20,
      outputUnit: 'units',
      timestamp: '2024-01-03T00:00:00Z',
      isTransformation: true,
      // Both currency and inputs are intentionally omitted
    };

    const canonicalBytes = canonicalize(payload);
    const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(signature),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.issues).toBeDefined();
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('returns response with attestation ID and issues when optional fields are missing', async () => {
    const keyPair = nacl.sign.keyPair();
    const payload = {
      productName: 'Sparse Product',
      productId: 'prod-sparse',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 50.0,
      labourCost: 30.0,
      outputQuantity: 8,
      outputUnit: 'kg',
      timestamp: '2024-01-04T00:00:00Z',
      isTransformation: false,
      // No currency, no inputs
    };

    const canonicalBytes = canonicalize(payload);
    const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(signature),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(typeof res.body.id).toBe('string');
    expect(res.body.contentHash).toBeDefined();
    expect(typeof res.body.contentHash).toBe('string');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });
});

describe('Edge Case Handling - Requirement 16.2: Broken Input References', () => {
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

  it('stores attestation with non-existent input reference instead of rejecting', async () => {
    const { payload, signature, publicKey } = createSignedAttestation({
      inputs: [{ attestationId: 'non-existent-ref-1', quantityUsed: 5, unit: 'kg' }],
    });

    // Re-sign with the inputs included
    const keyPair = nacl.sign.keyPair();
    const newPayload = {
      ...payload,
      inputs: [{ attestationId: 'non-existent-ref-1', quantityUsed: 5, unit: 'kg' }],
    };
    const canonicalBytes = canonicalize(newPayload);
    const sig = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload: newPayload,
      signature: bytesToHex(sig),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    // Should NOT reject - should store the attestation
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    // Verify it was actually stored in the database
    const stored = db.prepare('SELECT * FROM attestations WHERE id = ?').get(res.body.id) as any;
    expect(stored).toBeDefined();
  });

  it('flags BROKEN_LINK issue with CRITICAL severity for non-existent input reference', async () => {
    const keyPair = nacl.sign.keyPair();
    const payload = {
      productName: 'Broken Link Product',
      productId: 'prod-broken',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 100.0,
      labourCost: 50.0,
      currency: 'CAD',
      outputQuantity: 10,
      outputUnit: 'kg',
      timestamp: '2024-01-01T00:00:00Z',
      isTransformation: true,
      inputs: [{ attestationId: 'does-not-exist-abc', quantityUsed: 3, unit: 'kg' }],
    };

    const canonicalBytes = canonicalize(payload);
    const sig = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(sig),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    expect(res.status).toBe(201);

    // Should have a BROKEN_LINK issue with CRITICAL severity
    const brokenLinkIssue = res.body.issues.find(
      (i: any) => i.type === 'BROKEN_LINK'
    );
    expect(brokenLinkIssue).toBeDefined();
    expect(brokenLinkIssue.severity).toBe('CRITICAL');
  });

  it('flags BROKEN_LINK for each non-existent reference when multiple are broken', async () => {
    const keyPair = nacl.sign.keyPair();
    const payload = {
      productName: 'Multi Broken Product',
      productId: 'prod-multi-broken',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 100.0,
      labourCost: 50.0,
      currency: 'CAD',
      outputQuantity: 10,
      outputUnit: 'kg',
      timestamp: '2024-01-01T00:00:00Z',
      isTransformation: true,
      inputs: [
        { attestationId: 'missing-ref-1', quantityUsed: 3, unit: 'kg' },
        { attestationId: 'missing-ref-2', quantityUsed: 4, unit: 'kg' },
      ],
    };

    const canonicalBytes = canonicalize(payload);
    const sig = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(sig),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    expect(res.status).toBe(201);

    // Should have BROKEN_LINK issues for each missing reference
    const brokenLinkIssues = res.body.issues.filter(
      (i: any) => i.type === 'BROKEN_LINK'
    );
    expect(brokenLinkIssues.length).toBeGreaterThanOrEqual(2);
    expect(brokenLinkIssues.every((i: any) => i.severity === 'CRITICAL')).toBe(true);
  });

  it('stores input references in the database even when they point to non-existent attestations', async () => {
    const keyPair = nacl.sign.keyPair();
    const payload = {
      productName: 'Stored Broken Ref',
      productId: 'prod-stored-broken',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 100.0,
      labourCost: 50.0,
      currency: 'CAD',
      outputQuantity: 10,
      outputUnit: 'kg',
      timestamp: '2024-01-01T00:00:00Z',
      isTransformation: true,
      inputs: [{ attestationId: 'phantom-ref', quantityUsed: 7, unit: 'kg' }],
    };

    const canonicalBytes = canonicalize(payload);
    const sig = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    const res = await request(app, 'POST', '/attestations', {
      payload,
      signature: bytesToHex(sig),
      publicKey: bytesToHex(keyPair.publicKey),
    });

    expect(res.status).toBe(201);

    // Verify the input reference was stored in the database
    const inputRefs = db.prepare(
      'SELECT * FROM input_references WHERE attestation_id = ?'
    ).all(res.body.id) as any[];
    expect(inputRefs).toHaveLength(1);
    expect(inputRefs[0].input_attestation_id).toBe('phantom-ref');
  });
});

describe('Edge Case Handling - Requirement 16.3: DAG Traversal Depth Limit', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = initializeDatabase(':memory:');
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM issues');
    db.exec('DELETE FROM input_references');
    db.exec('DELETE FROM attestations');
  });

  function insertAttestation(id: string, opts: { inputs?: Array<{ id: string; qty: number; unit: string }> } = {}) {
    db.prepare(`
      INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, `hash-${id}`, 'supplier-1', 'pubkey-1', 'sig-1', '2024-01-01T00:00:00Z', `Product ${id}`, `product-${id}`, 0, 'CA', 100, 50, 'CAD', 10, 'kg', '{}');

    if (opts.inputs) {
      const insertInput = db.prepare(`
        INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
        VALUES (?, ?, ?, ?)
      `);
      for (const input of opts.inputs) {
        insertInput.run(id, input.id, input.qty, input.unit);
      }
    }
  }

  it('terminates traversal at 100 levels depth', () => {
    // Create a chain of 105 attestations (depth 0 to 104)
    const ids: string[] = [];
    for (let i = 0; i < 105; i++) {
      const id = `depth-att-${i}`;
      ids.push(id);
      if (i === 0) {
        insertAttestation(id);
      } else {
        insertAttestation(id, { inputs: [{ id: ids[i - 1], qty: 1, unit: 'kg' }] });
      }
    }

    // Walk from the last attestation (depth 104 from root)
    const result = walkAncestors(ids[104], db);

    expect(result.error).toBeUndefined();
    // Should have at most 101 attestations (depth 0 through 100)
    expect(result.attestations.length).toBeLessThanOrEqual(101);
    // The starting attestation should be included
    expect(result.attestations[0].id).toBe(ids[104]);
  });

  it('returns results from the traversed portion when truncated', () => {
    // Create a chain of 110 attestations
    const ids: string[] = [];
    for (let i = 0; i < 110; i++) {
      const id = `portion-att-${i}`;
      ids.push(id);
      if (i === 0) {
        insertAttestation(id);
      } else {
        insertAttestation(id, { inputs: [{ id: ids[i - 1], qty: 1, unit: 'kg' }] });
      }
    }

    const result = walkAncestors(ids[109], db);

    expect(result.error).toBeUndefined();
    // Should have results (not empty)
    expect(result.attestations.length).toBeGreaterThan(0);
    // Should be truncated (not all 110)
    expect(result.attestations.length).toBeLessThan(110);
  });

  it('includes INFO issue indicating chain was truncated at 100 levels', () => {
    // Create a chain of 105 attestations
    const ids: string[] = [];
    for (let i = 0; i < 105; i++) {
      const id = `info-att-${i}`;
      ids.push(id);
      if (i === 0) {
        insertAttestation(id);
      } else {
        insertAttestation(id, { inputs: [{ id: ids[i - 1], qty: 1, unit: 'kg' }] });
      }
    }

    const result = walkAncestors(ids[104], db);

    expect(result.error).toBeUndefined();
    // Should have an INFO issue about truncation
    expect(result.issues.length).toBeGreaterThan(0);
    const truncationIssue = result.issues.find(
      (i) => i.severity === 'INFO'
    );
    expect(truncationIssue).toBeDefined();
    expect(truncationIssue!.description).toContain('100');
    expect(truncationIssue!.description.toLowerCase()).toContain('truncat');
  });

  it('does NOT include truncation issue when chain is within 100 levels', () => {
    // Create a chain of 50 attestations (well within limit)
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `short-att-${i}`;
      ids.push(id);
      if (i === 0) {
        insertAttestation(id);
      } else {
        insertAttestation(id, { inputs: [{ id: ids[i - 1], qty: 1, unit: 'kg' }] });
      }
    }

    const result = walkAncestors(ids[49], db);

    expect(result.error).toBeUndefined();
    // Should have all 50 attestations
    expect(result.attestations).toHaveLength(50);
    // Should NOT have a truncation issue
    const truncationIssue = result.issues.find(
      (i) => i.severity === 'INFO'
    );
    expect(truncationIssue).toBeUndefined();
  });

  it('does NOT include truncation issue when chain is exactly 100 levels', () => {
    // Create a chain of exactly 101 attestations (depth 0 to 100)
    const ids: string[] = [];
    for (let i = 0; i < 101; i++) {
      const id = `exact-att-${i}`;
      ids.push(id);
      if (i === 0) {
        insertAttestation(id);
      } else {
        insertAttestation(id, { inputs: [{ id: ids[i - 1], qty: 1, unit: 'kg' }] });
      }
    }

    const result = walkAncestors(ids[100], db);

    expect(result.error).toBeUndefined();
    // Should have all 101 attestations (depth 0 through 100 inclusive)
    expect(result.attestations).toHaveLength(101);
    // Should NOT have a truncation issue since we fit exactly at the limit
    // The depth cap triggers at depth >= 100, meaning depth 100 nodes are included
    // but their children are not explored. If the chain is exactly 101 nodes deep
    // (depth 0 to 100), the last node at depth 100 has an input at depth 101 which
    // would be skipped. But since our chain is 101 nodes (indices 0-100), the starting
    // node is at depth 0 and the deepest is at depth 100. The node at depth 100
    // has no further inputs to explore, so no truncation occurs.
    const truncationIssue = result.issues.find(
      (i) => i.severity === 'INFO'
    );
    expect(truncationIssue).toBeUndefined();
  });
});
