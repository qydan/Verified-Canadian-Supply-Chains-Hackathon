/**
 * Unit tests for the unified anomaly detector facade.
 *
 * Tests:
 * - detectAll runs all 5 categories on a single attestation
 * - detectAllForChain runs all checks on every attestation in a chain
 * - Completeness issues get the correct attestationId assigned
 * - Structure checks receive attestationId (not attestation object)
 *
 * Requirements: 2.4, 8.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import Database from 'better-sqlite3';
import { detectAll, detectAllForChain } from './detector.js';
import { canonicalize } from '../crypto/canonicalize.js';
import { computeContentHash } from '../crypto/signature.js';
import { IssueType, Severity } from '../types.js';
import type { Attestation } from '../types.js';

/** Helper to convert bytes to hex */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Creates an in-memory database with the required schema */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      public_key TEXT NOT NULL,
      location TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS attestations (
      id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      signature TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_id TEXT NOT NULL,
      is_transformation INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL,
      material_cost REAL NOT NULL DEFAULT 0,
      labour_cost REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CAD',
      output_quantity REAL NOT NULL DEFAULT 0,
      output_unit TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS input_references (
      attestation_id TEXT NOT NULL,
      input_attestation_id TEXT NOT NULL,
      quantity_used REAL NOT NULL,
      unit TEXT NOT NULL
    );
  `);
  return db;
}

/** Creates a valid attestation with a real Ed25519 signature */
function createValidAttestation(
  overrides: Partial<{ id: string; productId: string; timestamp: string; location: string }> = {},
  keyPair?: nacl.SignKeyPair
): {
  attestation: Attestation;
  keyPair: nacl.SignKeyPair;
} {
  const kp = keyPair ?? nacl.sign.keyPair();

  const payload = {
    productName: 'Maple Syrup',
    productId: overrides.productId ?? 'prod-001',
    supplierId: 'supplier-001',
    location: overrides.location ?? 'CA',
    materialCost: 100,
    labourCost: 50,
    currency: 'CAD',
    outputQuantity: 10,
    outputUnit: 'L',
    timestamp: overrides.timestamp ?? '2024-01-15T10:00:00Z',
    isTransformation: true,
    inputs: [],
  };

  const canonicalBytes = canonicalize(payload);
  const signature = nacl.sign.detached(canonicalBytes, kp.secretKey);
  const contentHash = computeContentHash(payload);

  const attestation: Attestation = {
    id: overrides.id ?? 'att-001',
    contentHash,
    supplierId: payload.supplierId,
    publicKey: bytesToHex(kp.publicKey),
    signature: bytesToHex(signature),
    timestamp: payload.timestamp,
    productName: payload.productName,
    productId: payload.productId,
    isTransformation: payload.isTransformation,
    location: payload.location,
    materialCost: payload.materialCost,
    labourCost: payload.labourCost,
    currency: payload.currency,
    inputs: payload.inputs,
    outputQuantity: payload.outputQuantity,
    outputUnit: payload.outputUnit,
  };

  return { attestation, keyPair: kp };
}

/** Stores an attestation in the database */
function storeAttestation(db: Database.Database, attestation: Attestation): void {
  db.prepare(`
    INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    attestation.id,
    attestation.contentHash,
    attestation.supplierId,
    attestation.publicKey,
    attestation.signature,
    attestation.timestamp,
    attestation.productName,
    attestation.productId,
    attestation.isTransformation ? 1 : 0,
    attestation.location,
    attestation.materialCost,
    attestation.labourCost,
    attestation.currency,
    attestation.outputQuantity,
    attestation.outputUnit,
    '{}'
  );

  for (const input of attestation.inputs) {
    db.prepare(`
      INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
      VALUES (?, ?, ?, ?)
    `).run(attestation.id, input.attestationId, input.quantityUsed, input.unit);
  }
}

describe('detectAll', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should return no issues for a fully valid attestation with registered supplier', () => {
    const { attestation, keyPair } = createValidAttestation();

    // Register the supplier
    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-001', 'Test Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

    // Store the attestation (needed for structure checks)
    storeAttestation(db, attestation);

    const issues = detectAll(attestation, db);
    expect(issues).toHaveLength(0);
  });

  it('should run integrity checks and detect invalid signatures', () => {
    const { attestation, keyPair } = createValidAttestation();

    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-001', 'Test Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

    storeAttestation(db, attestation);

    // Tamper with the product name
    attestation.productName = 'Tampered Product';

    const issues = detectAll(attestation, db);
    const sigIssue = issues.find(i => i.type === IssueType.INVALID_SIGNATURE);
    expect(sigIssue).toBeDefined();
    expect(sigIssue!.severity).toBe(Severity.CRITICAL);
  });

  it('should run completeness checks and assign attestationId', () => {
    const kp = nacl.sign.keyPair();

    // Create an attestation with negative materialCost
    const payload = {
      productName: 'Test',
      productId: 'prod-001',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: -5,
      labourCost: 50,
      currency: 'CAD',
      outputQuantity: 10,
      outputUnit: 'L',
      timestamp: '2024-01-15T10:00:00Z',
      isTransformation: true,
      inputs: [],
    };

    const canonicalBytes = canonicalize(payload);
    const signature = nacl.sign.detached(canonicalBytes, kp.secretKey);
    const contentHash = computeContentHash(payload);

    const attestation: Attestation = {
      id: 'att-negative-cost',
      contentHash,
      supplierId: payload.supplierId,
      publicKey: bytesToHex(kp.publicKey),
      signature: bytesToHex(signature),
      timestamp: payload.timestamp,
      productName: payload.productName,
      productId: payload.productId,
      isTransformation: payload.isTransformation,
      location: payload.location,
      materialCost: payload.materialCost,
      labourCost: payload.labourCost,
      currency: payload.currency,
      inputs: payload.inputs,
      outputQuantity: payload.outputQuantity,
      outputUnit: payload.outputUnit,
    };

    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-001', 'Test Supplier', bytesToHex(kp.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

    storeAttestation(db, attestation);

    const issues = detectAll(attestation, db);
    const completenessIssue = issues.find(
      i => i.type === IssueType.MISSING_REQUIRED_FIELD && i.severity === Severity.WARNING
    );
    expect(completenessIssue).toBeDefined();
    expect(completenessIssue!.attestationId).toBe('att-negative-cost');
  });

  it('should run structural checks using attestationId', () => {
    const { attestation, keyPair } = createValidAttestation();

    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-001', 'Test Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

    // Add a broken link input reference
    attestation.inputs = [{ attestationId: 'non-existent-id', quantityUsed: 5, unit: 'L' }];

    storeAttestation(db, attestation);

    const issues = detectAll(attestation, db);
    const brokenLink = issues.find(i => i.type === IssueType.BROKEN_LINK);
    expect(brokenLink).toBeDefined();
    expect(brokenLink!.severity).toBe(Severity.CRITICAL);
  });

  it('should run all 5 categories independently', () => {
    const { attestation } = createValidAttestation();

    // Don't register supplier → UNREGISTERED_SUPPLIER from integrity
    // Don't store attestation → structure check won't find it (returns empty)
    // Attestation has valid fields → completeness should pass

    storeAttestation(db, attestation);

    const issues = detectAll(attestation, db);

    // Should at least have UNREGISTERED_SUPPLIER from integrity check
    const supplierIssue = issues.find(i => i.type === IssueType.UNREGISTERED_SUPPLIER);
    expect(supplierIssue).toBeDefined();
  });
});

describe('detectAllForChain', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should return no issues for a valid chain', () => {
    const kp = nacl.sign.keyPair();

    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-001', 'Test Supplier', bytesToHex(kp.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

    const { attestation: att1 } = createValidAttestation({ id: 'att-001', timestamp: '2024-01-10T10:00:00Z' }, kp);
    const { attestation: att2 } = createValidAttestation({ id: 'att-002', timestamp: '2024-01-15T10:00:00Z' }, kp);

    storeAttestation(db, att1);
    storeAttestation(db, att2);

    const issues = detectAllForChain([att1, att2], db);
    expect(issues).toHaveLength(0);
  });

  it('should aggregate issues from all attestations in the chain', () => {
    const kp = nacl.sign.keyPair();

    // Don't register supplier → each attestation gets UNREGISTERED_SUPPLIER

    const { attestation: att1 } = createValidAttestation({ id: 'att-001', timestamp: '2024-01-10T10:00:00Z' }, kp);
    const { attestation: att2 } = createValidAttestation({ id: 'att-002', timestamp: '2024-01-15T10:00:00Z' }, kp);

    storeAttestation(db, att1);
    storeAttestation(db, att2);

    const issues = detectAllForChain([att1, att2], db);

    // Each attestation should have at least one issue (UNREGISTERED_SUPPLIER)
    const att1Issues = issues.filter(i => i.attestationId === 'att-001');
    const att2Issues = issues.filter(i => i.attestationId === 'att-002');

    expect(att1Issues.length).toBeGreaterThan(0);
    expect(att2Issues.length).toBeGreaterThan(0);
  });

  it('should return empty array for empty chain', () => {
    const issues = detectAllForChain([], db);
    expect(issues).toHaveLength(0);
  });

  it('should detect issues across different categories in a chain', () => {
    const kp = nacl.sign.keyPair();

    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('sup-001', 'Test Supplier', bytesToHex(kp.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

    // First attestation is valid
    const { attestation: att1 } = createValidAttestation({ id: 'att-001', timestamp: '2024-01-10T10:00:00Z' }, kp);
    storeAttestation(db, att1);

    // Second attestation has a broken link
    const { attestation: att2 } = createValidAttestation({ id: 'att-002', timestamp: '2024-01-15T10:00:00Z' }, kp);
    att2.inputs = [{ attestationId: 'non-existent', quantityUsed: 5, unit: 'L' }];
    storeAttestation(db, att2);

    const issues = detectAllForChain([att1, att2], db);

    // att1 should have no issues, att2 should have BROKEN_LINK
    const att1Issues = issues.filter(i => i.attestationId === 'att-001');
    const att2Issues = issues.filter(i => i.attestationId === 'att-002');

    expect(att1Issues).toHaveLength(0);
    expect(att2Issues.find(i => i.type === IssueType.BROKEN_LINK)).toBeDefined();
  });
});
