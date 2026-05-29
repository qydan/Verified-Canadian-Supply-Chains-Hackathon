import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkQuantity } from './quantity.js';
import { initializeDatabase } from '../database.js';
import { IssueType, Severity } from '../types.js';
import type { Attestation } from '../types.js';
import type Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('checkQuantity', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-quantity-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

  function insertAttestation(id: string, outputQuantity: number | null, outputUnit: string | null) {
    db.prepare(`
      INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, `hash-${id}`, 'supplier-1', 'pubkey', 'sig', '2024-01-01T00:00:00Z', 'Product', `product-${id}`, 0, 'CA', 10, 5, 'CAD', outputQuantity, outputUnit, '{}');
  }

  function ensureAttestationExists(id: string) {
    const existing = db.prepare('SELECT id FROM attestations WHERE id = ?').get(id);
    if (!existing) {
      insertAttestation(id, 100, 'kg');
    }
  }

  function insertInputReference(attestationId: string, inputAttestationId: string, quantityUsed: number, unit: string) {
    ensureAttestationExists(attestationId);
    db.prepare(`
      INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
      VALUES (?, ?, ?, ?)
    `).run(attestationId, inputAttestationId, quantityUsed, unit);
  }

  function makeAttestation(id: string, inputs: { attestationId: string; quantityUsed: number; unit: string }[]): Attestation {
    return {
      id,
      contentHash: `hash-${id}`,
      supplierId: 'supplier-1',
      publicKey: 'pubkey',
      signature: 'sig',
      timestamp: '2024-01-01T00:00:00Z',
      productName: 'Product',
      productId: `product-${id}`,
      isTransformation: false,
      location: 'CA',
      materialCost: 10,
      labourCost: 5,
      currency: 'CAD',
      inputs,
      outputQuantity: 100,
      outputUnit: 'kg',
    };
  }

  it('should return no issues when no inputs exist', () => {
    const attestation = makeAttestation('att-1', []);
    const issues = checkQuantity(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should return no issues when upstream does not exist in database', () => {
    const attestation = makeAttestation('att-1', [
      { attestationId: 'non-existent', quantityUsed: 50, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should skip check when upstream outputQuantity is null', () => {
    insertAttestation('upstream-1', null, 'kg');
    insertInputReference('att-1', 'upstream-1', 50, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 50, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should skip check when upstream outputQuantity is zero', () => {
    insertAttestation('upstream-1', 0, 'kg');
    insertInputReference('att-1', 'upstream-1', 50, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 50, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should skip check when upstream outputQuantity is negative', () => {
    insertAttestation('upstream-1', -10, 'kg');
    insertInputReference('att-1', 'upstream-1', 5, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 5, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should flag WARNING when units do not match (case-sensitive)', () => {
    insertAttestation('upstream-1', 100, 'kg');
    insertInputReference('att-1', 'upstream-1', 50, 'Kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 50, unit: 'Kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe(IssueType.QUANTITY_EXCEEDS_UPSTREAM);
    expect(issues[0].severity).toBe(Severity.WARNING);
    expect(issues[0].details).toMatchObject({
      inputAttestationId: 'upstream-1',
      consumerUnit: 'Kg',
      upstreamUnit: 'kg',
    });
  });

  it('should flag WARNING when units differ (L vs kg)', () => {
    insertAttestation('upstream-1', 100, 'L');
    insertInputReference('att-1', 'upstream-1', 50, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 50, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe(IssueType.QUANTITY_EXCEEDS_UPSTREAM);
    expect(issues[0].severity).toBe(Severity.WARNING);
  });

  it('should return no issues when total consumed does not exceed upstream output', () => {
    insertAttestation('upstream-1', 100, 'kg');
    insertInputReference('att-1', 'upstream-1', 50, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 50, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should return no issues when total consumed equals upstream output exactly', () => {
    insertAttestation('upstream-1', 100, 'kg');
    insertInputReference('att-1', 'upstream-1', 100, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 100, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toEqual([]);
  });

  it('should flag CRITICAL when single consumer exceeds upstream output', () => {
    insertAttestation('upstream-1', 100, 'kg');
    insertInputReference('att-1', 'upstream-1', 150, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 150, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe(IssueType.QUANTITY_EXCEEDS_UPSTREAM);
    expect(issues[0].severity).toBe(Severity.CRITICAL);
    expect(issues[0].details).toMatchObject({
      inputAttestationId: 'upstream-1',
      produced: 100,
      totalConsumed: 150,
      unit: 'kg',
    });
  });

  it('should flag CRITICAL when multiple consumers together exceed upstream output', () => {
    insertAttestation('upstream-1', 100, 'kg');
    // Two consumers each using 60 kg = 120 total > 100
    insertInputReference('att-1', 'upstream-1', 60, 'kg');
    insertInputReference('att-2', 'upstream-1', 60, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 60, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe(IssueType.QUANTITY_EXCEEDS_UPSTREAM);
    expect(issues[0].severity).toBe(Severity.CRITICAL);
    expect(issues[0].details).toMatchObject({
      inputAttestationId: 'upstream-1',
      produced: 100,
      totalConsumed: 120,
      unit: 'kg',
    });
  });

  it('should only sum matching units when computing total consumed', () => {
    insertAttestation('upstream-1', 100, 'kg');
    // att-1 uses 60 kg, att-2 uses 60 L (different unit - should not be summed)
    insertInputReference('att-1', 'upstream-1', 60, 'kg');
    insertInputReference('att-2', 'upstream-1', 60, 'L');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 60, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    // Only 60 kg total consumed (matching unit), which is <= 100 kg produced
    expect(issues).toEqual([]);
  });

  it('should handle multiple input references in a single attestation', () => {
    insertAttestation('upstream-1', 100, 'kg');
    insertAttestation('upstream-2', 50, 'L');
    insertInputReference('att-1', 'upstream-1', 80, 'kg');
    insertInputReference('att-1', 'upstream-2', 60, 'L');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 80, unit: 'kg' },
      { attestationId: 'upstream-2', quantityUsed: 60, unit: 'L' },
    ]);
    const issues = checkQuantity(attestation, db);
    // upstream-1: 80 <= 100, OK
    // upstream-2: 60 > 50, CRITICAL
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe(IssueType.QUANTITY_EXCEEDS_UPSTREAM);
    expect(issues[0].severity).toBe(Severity.CRITICAL);
    expect(issues[0].details).toMatchObject({
      inputAttestationId: 'upstream-2',
      produced: 50,
      totalConsumed: 60,
      unit: 'L',
    });
  });

  it('should include attestation ID in the issue', () => {
    insertAttestation('upstream-1', 100, 'kg');
    insertInputReference('att-1', 'upstream-1', 150, 'kg');

    const attestation = makeAttestation('att-1', [
      { attestationId: 'upstream-1', quantityUsed: 150, unit: 'kg' },
    ]);
    const issues = checkQuantity(attestation, db);
    expect(issues[0].attestationId).toBe('att-1');
  });
});
