/**
 * Unit tests for integrity violation detection.
 *
 * Tests all four checks:
 * 1. Ed25519 signature verification
 * 2. Content hash verification
 * 3. Supplier registry lookup
 * 4. Signature/publicKey byte length validation
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import Database from 'better-sqlite3';
import { checkIntegrity } from './integrity.js';
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
  `);
  return db;
}

/** Creates a valid attestation with a real Ed25519 signature */
function createValidAttestation(keyPair?: nacl.SignKeyPair): {
  attestation: Attestation;
  keyPair: nacl.SignKeyPair;
} {
  const kp = keyPair ?? nacl.sign.keyPair();

  const payload = {
    productName: 'Maple Syrup',
    productId: 'prod-001',
    supplierId: 'supplier-001',
    location: 'CA',
    materialCost: 100,
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
    id: 'att-001',
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

describe('checkIntegrity', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('valid attestation with registered supplier', () => {
    it('should return no issues for a fully valid attestation', () => {
      const { attestation, keyPair } = createValidAttestation();

      // Register the supplier
      db.prepare(
        'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('sup-001', 'Test Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

      const issues = checkIntegrity(attestation, db);
      expect(issues).toHaveLength(0);
    });
  });

  describe('Check 1: Ed25519 signature verification (Requirement 8.1)', () => {
    it('should report INVALID_SIGNATURE when payload is tampered', () => {
      const { attestation, keyPair } = createValidAttestation();

      // Register supplier so we only get signature issue
      db.prepare(
        'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('sup-001', 'Test Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

      // Tamper with the product name (signature won't match)
      attestation.productName = 'Tampered Product';

      const issues = checkIntegrity(attestation, db);
      const sigIssue = issues.find(i => i.type === IssueType.INVALID_SIGNATURE);
      expect(sigIssue).toBeDefined();
      expect(sigIssue!.severity).toBe(Severity.CRITICAL);
      expect(sigIssue!.attestationId).toBe(attestation.id);
    });

    it('should report INVALID_SIGNATURE when signature is from wrong key', () => {
      const { attestation } = createValidAttestation();
      const otherKeyPair = nacl.sign.keyPair();

      // Use a different public key (signature was made with original key)
      attestation.publicKey = bytesToHex(otherKeyPair.publicKey);

      // Register the other supplier
      db.prepare(
        'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('sup-001', 'Other Supplier', bytesToHex(otherKeyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

      const issues = checkIntegrity(attestation, db);
      const sigIssue = issues.find(i => i.type === IssueType.INVALID_SIGNATURE);
      expect(sigIssue).toBeDefined();
      expect(sigIssue!.severity).toBe(Severity.CRITICAL);
    });
  });

  describe('Check 2: Content hash verification (Requirement 8.2)', () => {
    it('should report MODIFIED_PAYLOAD when content hash does not match', () => {
      const { attestation, keyPair } = createValidAttestation();

      // Register supplier
      db.prepare(
        'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('sup-001', 'Test Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

      // Tamper with the stored content hash
      attestation.contentHash = 'a'.repeat(64);

      const issues = checkIntegrity(attestation, db);
      const hashIssue = issues.find(i => i.type === IssueType.MODIFIED_PAYLOAD);
      expect(hashIssue).toBeDefined();
      expect(hashIssue!.severity).toBe(Severity.CRITICAL);
      expect(hashIssue!.attestationId).toBe(attestation.id);
    });
  });

  describe('Check 3: Supplier registry lookup (Requirements 8.3, 8.4)', () => {
    it('should report UNREGISTERED_SUPPLIER with CRITICAL severity when key not in registry', () => {
      const { attestation } = createValidAttestation();

      // Don't register any supplier
      const issues = checkIntegrity(attestation, db);
      const supplierIssue = issues.find(i => i.type === IssueType.UNREGISTERED_SUPPLIER);
      expect(supplierIssue).toBeDefined();
      expect(supplierIssue!.severity).toBe(Severity.CRITICAL);
      expect(supplierIssue!.attestationId).toBe(attestation.id);
    });

    it('should report UNREGISTERED_SUPPLIER with WARNING severity when supplier is inactive', () => {
      const { attestation, keyPair } = createValidAttestation();

      // Register supplier as inactive
      db.prepare(
        'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('sup-001', 'Inactive Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 0);

      const issues = checkIntegrity(attestation, db);
      const supplierIssue = issues.find(i => i.type === IssueType.UNREGISTERED_SUPPLIER);
      expect(supplierIssue).toBeDefined();
      expect(supplierIssue!.severity).toBe(Severity.WARNING);
      expect(supplierIssue!.attestationId).toBe(attestation.id);
    });

    it('should not report supplier issue when supplier is active', () => {
      const { attestation, keyPair } = createValidAttestation();

      // Register supplier as active
      db.prepare(
        'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('sup-001', 'Active Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

      const issues = checkIntegrity(attestation, db);
      const supplierIssue = issues.find(i => i.type === IssueType.UNREGISTERED_SUPPLIER);
      expect(supplierIssue).toBeUndefined();
    });
  });

  describe('Check 4: Byte length validation (Requirement 8.6)', () => {
    it('should report INVALID_SIGNATURE when signature is not 64 bytes', () => {
      const { attestation, keyPair } = createValidAttestation();

      // Register supplier
      db.prepare(
        'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('sup-001', 'Test Supplier', bytesToHex(keyPair.publicKey), 'CA', '2024-01-01T00:00:00Z', 1);

      // Set signature to wrong length (63 bytes = 126 hex chars)
      attestation.signature = 'ab'.repeat(63);

      const issues = checkIntegrity(attestation, db);
      const sigIssue = issues.find(
        i => i.type === IssueType.INVALID_SIGNATURE && i.description.includes('Signature')
      );
      expect(sigIssue).toBeDefined();
      expect(sigIssue!.severity).toBe(Severity.CRITICAL);
    });

    it('should report INVALID_SIGNATURE when publicKey is not 32 bytes', () => {
      const { attestation } = createValidAttestation();

      // Set publicKey to wrong length (31 bytes = 62 hex chars)
      attestation.publicKey = 'ab'.repeat(31);

      const issues = checkIntegrity(attestation, db);
      const pkIssue = issues.find(
        i => i.type === IssueType.INVALID_SIGNATURE && i.description.includes('Public key')
      );
      expect(pkIssue).toBeDefined();
      expect(pkIssue!.severity).toBe(Severity.CRITICAL);
    });

    it('should not attempt signature verification when lengths are invalid', () => {
      const { attestation } = createValidAttestation();

      // Both lengths wrong
      attestation.signature = 'ab'.repeat(10); // 10 bytes
      attestation.publicKey = 'cd'.repeat(10); // 10 bytes

      const issues = checkIntegrity(attestation, db);

      // Should have length issues but NOT a "Signature does not match payload" issue
      const lengthIssues = issues.filter(
        i => i.type === IssueType.INVALID_SIGNATURE && (i.description.includes('bytes, expected') )
      );
      expect(lengthIssues.length).toBe(2);

      const verificationIssue = issues.find(
        i => i.type === IssueType.INVALID_SIGNATURE && i.description.includes('does not match payload')
      );
      expect(verificationIssue).toBeUndefined();
    });
  });

  describe('Independent execution of all checks (Requirement 8.5)', () => {
    it('should report multiple issues when multiple checks fail', () => {
      const { attestation } = createValidAttestation();

      // Tamper with payload (will fail signature check)
      attestation.productName = 'Tampered';
      // Tamper with content hash (will fail hash check)
      attestation.contentHash = 'f'.repeat(64);
      // Don't register supplier (will fail registry check)

      const issues = checkIntegrity(attestation, db);

      // Should have at least: INVALID_SIGNATURE, MODIFIED_PAYLOAD, UNREGISTERED_SUPPLIER
      const types = issues.map(i => i.type);
      expect(types).toContain(IssueType.INVALID_SIGNATURE);
      expect(types).toContain(IssueType.MODIFIED_PAYLOAD);
      expect(types).toContain(IssueType.UNREGISTERED_SUPPLIER);
    });

    it('should report both length issues and supplier issue independently', () => {
      const { attestation } = createValidAttestation();

      // Invalid lengths
      attestation.signature = 'ab'.repeat(10);
      attestation.publicKey = 'cd'.repeat(10);
      // Don't register supplier

      const issues = checkIntegrity(attestation, db);

      // Should have length issues AND unregistered supplier
      const sigLengthIssues = issues.filter(
        i => i.type === IssueType.INVALID_SIGNATURE
      );
      const supplierIssue = issues.find(i => i.type === IssueType.UNREGISTERED_SUPPLIER);

      expect(sigLengthIssues.length).toBeGreaterThanOrEqual(1);
      expect(supplierIssue).toBeDefined();
    });
  });
});
