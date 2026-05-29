/**
 * Anomaly Detection - Integrity Violations
 *
 * Detects:
 * - Invalid Ed25519 signatures (INVALID_SIGNATURE, CRITICAL)
 * - Modified payloads / content hash mismatch (MODIFIED_PAYLOAD, CRITICAL)
 * - Unregistered or inactive suppliers (UNREGISTERED_SUPPLIER, CRITICAL/WARNING)
 * - Invalid signature/publicKey byte lengths (INVALID_SIGNATURE, CRITICAL)
 *
 * All checks execute independently (don't stop at first failure).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import type Database from 'better-sqlite3';
import type { Attestation, Issue } from '../types.js';
import { IssueType, Severity } from '../types.js';
import { verifySignature, computeContentHash } from '../crypto/signature.js';
import { canonicalize } from '../crypto/canonicalize.js';

interface SupplierRow {
  id: string;
  name: string;
  public_key: string;
  location: string;
  registered_at: string;
  is_active: number;
}

/**
 * Converts a hex string to byte length (2 hex chars = 1 byte).
 */
function hexByteLength(hex: string): number {
  return hex.length / 2;
}

/**
 * Converts a hexadecimal string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Checks integrity violations for a single attestation.
 *
 * Executes all checks independently and returns all detected issues.
 */
export function checkIntegrity(attestation: Attestation, db: Database.Database): Issue[] {
  const issues: Issue[] = [];

  // Check 4 (first): Validate signature is 64 bytes and publicKey is 32 bytes
  // If lengths are invalid, report INVALID_SIGNATURE without attempting verification
  const sigByteLen = hexByteLength(attestation.signature);
  const pkByteLen = hexByteLength(attestation.publicKey);
  const sigLengthValid = sigByteLen === 64;
  const pkLengthValid = pkByteLen === 32;

  if (!sigLengthValid) {
    issues.push({
      type: IssueType.INVALID_SIGNATURE,
      severity: Severity.CRITICAL,
      attestationId: attestation.id,
      description: `Signature is ${sigByteLen} bytes, expected 64 bytes`,
      details: { actualLength: sigByteLen, expectedLength: 64 },
    });
  }

  if (!pkLengthValid) {
    issues.push({
      type: IssueType.INVALID_SIGNATURE,
      severity: Severity.CRITICAL,
      attestationId: attestation.id,
      description: `Public key is ${pkByteLen} bytes, expected 32 bytes`,
      details: { actualLength: pkByteLen, expectedLength: 32 },
    });
  }

  // Check 1: Verify Ed25519 signature matches canonicalized payload
  // Only attempt if lengths are valid
  if (sigLengthValid && pkLengthValid) {
    const payload = {
      productName: attestation.productName,
      productId: attestation.productId,
      supplierId: attestation.supplierId,
      location: attestation.location,
      materialCost: attestation.materialCost,
      labourCost: attestation.labourCost,
      currency: attestation.currency,
      outputQuantity: attestation.outputQuantity,
      outputUnit: attestation.outputUnit,
      timestamp: attestation.timestamp,
      isTransformation: attestation.isTransformation,
      inputs: attestation.inputs,
    };

    const canonicalBytes = canonicalize(payload);
    const signatureBytes = hexToBytes(attestation.signature);
    const publicKeyBytes = hexToBytes(attestation.publicKey);

    const signatureValid = verifySignature(canonicalBytes, signatureBytes, publicKeyBytes);

    if (!signatureValid) {
      issues.push({
        type: IssueType.INVALID_SIGNATURE,
        severity: Severity.CRITICAL,
        attestationId: attestation.id,
        description: 'Signature does not match payload - attestation may be modified',
      });
    }

    // Check 2: Verify stored content hash matches recomputed SHA-256
    const computedHash = computeContentHash(payload);
    if (computedHash !== attestation.contentHash) {
      issues.push({
        type: IssueType.MODIFIED_PAYLOAD,
        severity: Severity.CRITICAL,
        attestationId: attestation.id,
        description: 'Content hash mismatch - payload has been tampered with',
        details: { storedHash: attestation.contentHash, computedHash },
      });
    }
  }

  // Check 3: Verify publicKey exists in supplier registry
  const supplier = db
    .prepare('SELECT * FROM suppliers WHERE public_key = ?')
    .get(attestation.publicKey) as SupplierRow | undefined;

  if (!supplier) {
    issues.push({
      type: IssueType.UNREGISTERED_SUPPLIER,
      severity: Severity.CRITICAL,
      attestationId: attestation.id,
      description: 'Signing key not found in supplier registry',
      details: { publicKey: attestation.publicKey },
    });
  } else if (supplier.is_active === 0) {
    issues.push({
      type: IssueType.UNREGISTERED_SUPPLIER,
      severity: Severity.WARNING,
      attestationId: attestation.id,
      description: 'Supplier is deactivated in registry',
      details: { publicKey: attestation.publicKey, supplierId: supplier.id },
    });
  }

  return issues;
}
