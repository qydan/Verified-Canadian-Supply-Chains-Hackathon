import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkReplay } from './replay.js';
import { initializeDatabase } from '../database.js';
import { IssueType, Severity } from '../types.js';
import type { Attestation } from '../types.js';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('checkReplay', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-replay-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = initializeDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch {
      // ignore cleanup errors
    }
  });

  function insertAttestation(att: Partial<Attestation> & { id: string; productId: string }) {
    db.prepare(`
      INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      att.id,
      att.contentHash ?? 'hash-' + att.id,
      att.supplierId ?? 'supplier-1',
      att.publicKey ?? 'pubkey-1',
      att.signature ?? 'sig-1',
      att.timestamp ?? '2024-01-01T00:00:00Z',
      att.productName ?? 'Product',
      att.productId,
      att.isTransformation ? 1 : 0,
      att.location ?? 'CA',
      att.materialCost ?? 100,
      att.labourCost ?? 50,
      att.currency ?? 'CAD',
      att.outputQuantity ?? 10,
      att.outputUnit ?? 'kg',
      '{}'
    );
  }

  function insertInputReference(attestationId: string, inputAttestationId: string, quantityUsed = 5, unit = 'kg') {
    db.prepare(`
      INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
      VALUES (?, ?, ?, ?)
    `).run(attestationId, inputAttestationId, quantityUsed, unit);
  }

  function makeAttestation(overrides: Partial<Attestation> = {}): Attestation {
    return {
      id: 'att-current',
      contentHash: 'hash-current',
      supplierId: 'supplier-1',
      publicKey: 'pubkey-1',
      signature: 'sig-1',
      timestamp: '2024-01-01T00:00:00Z',
      productName: 'Product A',
      productId: 'product-A',
      isTransformation: false,
      location: 'CA',
      materialCost: 100,
      labourCost: 50,
      currency: 'CAD',
      inputs: [],
      outputQuantity: 10,
      outputUnit: 'kg',
      ...overrides,
    };
  }

  it('should return no issues when attestation has no inputs', () => {
    const attestation = makeAttestation({ inputs: [] });
    const issues = checkReplay(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should skip replay check if referenced input does not exist in database (Req 9.4)', () => {
    const attestation = makeAttestation({
      inputs: [{ attestationId: 'non-existent-input', quantityUsed: 5, unit: 'kg' }],
    });
    const issues = checkReplay(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should NOT flag when multiple attestations with same productId reference same input (Req 9.2)', () => {
    // Insert the shared input
    insertAttestation({ id: 'shared-input', productId: 'product-upstream' });

    // Insert another consumer with the SAME productId
    insertAttestation({ id: 'other-consumer', productId: 'product-A' });
    insertInputReference('other-consumer', 'shared-input');

    // Current attestation also references the shared input
    const attestation = makeAttestation({
      id: 'att-current',
      productId: 'product-A',
      inputs: [{ attestationId: 'shared-input', quantityUsed: 5, unit: 'kg' }],
    });

    // Insert current attestation and its input reference
    insertAttestation({ id: 'att-current', productId: 'product-A' });
    insertInputReference('att-current', 'shared-input');

    const issues = checkReplay(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should flag REPLAY_DETECTED when same input is referenced by attestations with different productIds (Req 9.1)', () => {
    // Insert the shared input
    insertAttestation({ id: 'shared-input', productId: 'product-upstream' });

    // Insert another consumer with a DIFFERENT productId
    insertAttestation({ id: 'other-consumer', productId: 'product-B' });
    insertInputReference('other-consumer', 'shared-input');

    // Current attestation references the same input
    const attestation = makeAttestation({
      id: 'att-current',
      productId: 'product-A',
      inputs: [{ attestationId: 'shared-input', quantityUsed: 5, unit: 'kg' }],
    });

    // Insert current attestation and its input reference
    insertAttestation({ id: 'att-current', productId: 'product-A' });
    insertInputReference('att-current', 'shared-input');

    const issues = checkReplay(attestation, db);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe(IssueType.REPLAY_DETECTED);
    expect(issues[0].severity).toBe(Severity.CRITICAL);
    expect(issues[0].attestationId).toBe('att-current');
  });

  it('should include sharedAttestationId, otherProductId, otherConsumerId in issue details (Req 9.3)', () => {
    // Insert the shared input
    insertAttestation({ id: 'shared-input', productId: 'product-upstream' });

    // Insert another consumer with a DIFFERENT productId
    insertAttestation({ id: 'other-consumer', productId: 'product-B' });
    insertInputReference('other-consumer', 'shared-input');

    // Current attestation references the same input
    const attestation = makeAttestation({
      id: 'att-current',
      productId: 'product-A',
      inputs: [{ attestationId: 'shared-input', quantityUsed: 5, unit: 'kg' }],
    });

    insertAttestation({ id: 'att-current', productId: 'product-A' });
    insertInputReference('att-current', 'shared-input');

    const issues = checkReplay(attestation, db);
    expect(issues).toHaveLength(1);
    expect(issues[0].details).toEqual({
      sharedAttestationId: 'shared-input',
      otherProductId: 'product-B',
      otherConsumerId: 'other-consumer',
    });
  });

  it('should flag multiple replay issues when multiple different-product consumers exist', () => {
    // Insert the shared input
    insertAttestation({ id: 'shared-input', productId: 'product-upstream' });

    // Insert two consumers with different productIds
    insertAttestation({ id: 'consumer-B', productId: 'product-B' });
    insertInputReference('consumer-B', 'shared-input');

    insertAttestation({ id: 'consumer-C', productId: 'product-C' });
    insertInputReference('consumer-C', 'shared-input');

    // Current attestation references the same input
    const attestation = makeAttestation({
      id: 'att-current',
      productId: 'product-A',
      inputs: [{ attestationId: 'shared-input', quantityUsed: 5, unit: 'kg' }],
    });

    insertAttestation({ id: 'att-current', productId: 'product-A' });
    insertInputReference('att-current', 'shared-input');

    const issues = checkReplay(attestation, db);
    expect(issues).toHaveLength(2);

    const productIds = issues.map(i => (i.details as Record<string, unknown>).otherProductId);
    expect(productIds).toContain('product-B');
    expect(productIds).toContain('product-C');
  });

  it('should check replay for each input reference independently', () => {
    // Insert two shared inputs
    insertAttestation({ id: 'input-1', productId: 'product-upstream-1' });
    insertAttestation({ id: 'input-2', productId: 'product-upstream-2' });

    // Consumer of input-1 with different productId
    insertAttestation({ id: 'consumer-X', productId: 'product-X' });
    insertInputReference('consumer-X', 'input-1');

    // Consumer of input-2 with different productId
    insertAttestation({ id: 'consumer-Y', productId: 'product-Y' });
    insertInputReference('consumer-Y', 'input-2');

    // Current attestation references both inputs
    const attestation = makeAttestation({
      id: 'att-current',
      productId: 'product-A',
      inputs: [
        { attestationId: 'input-1', quantityUsed: 5, unit: 'kg' },
        { attestationId: 'input-2', quantityUsed: 3, unit: 'kg' },
      ],
    });

    insertAttestation({ id: 'att-current', productId: 'product-A' });
    insertInputReference('att-current', 'input-1');
    insertInputReference('att-current', 'input-2');

    const issues = checkReplay(attestation, db);
    expect(issues).toHaveLength(2);

    const sharedIds = issues.map(i => (i.details as Record<string, unknown>).sharedAttestationId);
    expect(sharedIds).toContain('input-1');
    expect(sharedIds).toContain('input-2');
  });

  it('should not flag the attestation itself as a replay consumer', () => {
    // Insert the shared input
    insertAttestation({ id: 'shared-input', productId: 'product-upstream' });

    // Current attestation is the only consumer
    const attestation = makeAttestation({
      id: 'att-current',
      productId: 'product-A',
      inputs: [{ attestationId: 'shared-input', quantityUsed: 5, unit: 'kg' }],
    });

    insertAttestation({ id: 'att-current', productId: 'product-A' });
    insertInputReference('att-current', 'shared-input');

    const issues = checkReplay(attestation, db);
    expect(issues).toEqual([]);
  });
});
