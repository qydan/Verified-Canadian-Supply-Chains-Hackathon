/**
 * Ed25519 signature verification and content hashing.
 *
 * Provides:
 * - Ed25519 signature verification using tweetnacl
 * - SHA-256 content hashing using @noble/hashes
 * - End-to-end attestation verification (signature + content hash)
 *
 * Requirements: 4.3, 4.4, 4.5, 4.6
 */

import nacl from 'tweetnacl';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize } from './canonicalize.js';
import type { Attestation, SignatureResult, IssueType, Severity, Issue } from '../types.js';

/**
 * Verifies an Ed25519 signature against a payload and public key.
 *
 * Validates that the signature is exactly 64 bytes and the public key is
 * exactly 32 bytes before attempting verification. Returns false immediately
 * if either length check fails.
 *
 * Requirement 4.3: Returns TRUE only if the 64-byte signature is cryptographically
 * valid for the given payload and 32-byte public key.
 * Requirement 4.5: Returns FALSE without attempting verification if key/signature
 * lengths are invalid.
 */
export function verifySignature(
  payload: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  // Requirement 4.5: Validate lengths before attempting verification
  if (signature.length !== 64) {
    return false;
  }
  if (publicKey.length !== 32) {
    return false;
  }

  // Requirement 4.3: Verify Ed25519 signature
  return nacl.sign.detached.verify(payload, signature, publicKey);
}

/**
 * Computes the SHA-256 content hash of a canonicalized payload.
 *
 * The payload is first canonicalized (deep-sorted keys, no whitespace JSON,
 * UTF-8 encoded) and then hashed with SHA-256. The result is returned as a
 * 64-character lowercase hexadecimal string.
 *
 * Requirement 4.4: Produces SHA-256 hash of canonicalized payload as 64-char
 * lowercase hex string.
 */
export function computeContentHash(payload: unknown): string {
  const canonicalBytes = canonicalize(payload);
  const hash = sha256(canonicalBytes);
  return bytesToHex(hash);
}

/**
 * Verifies an attestation end-to-end: signature validity and content hash match.
 *
 * Steps:
 * 1. Reconstruct the signing payload from the attestation fields
 * 2. Canonicalize the payload
 * 3. Verify the Ed25519 signature over the canonical bytes
 * 4. Recompute the content hash and compare to the stored value
 *
 * Requirement 4.6: Canonicalizes payload, verifies Ed25519 signature, and
 * recomputes content hash, reporting failure if either check fails.
 */
export function verifyAttestation(attestation: Attestation): SignatureResult {
  const issues: Issue[] = [];

  // Reconstruct the payload that was originally signed
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

  // Canonicalize the payload
  const canonicalBytes = canonicalize(payload);

  // Decode hex-encoded signature and public key
  const signatureBytes = hexToBytes(attestation.signature);
  const publicKeyBytes = hexToBytes(attestation.publicKey);

  // Verify the Ed25519 signature
  const signatureValid = verifySignature(canonicalBytes, signatureBytes, publicKeyBytes);

  if (!signatureValid) {
    issues.push({
      type: 'INVALID_SIGNATURE' as IssueType,
      severity: 'CRITICAL' as Severity,
      attestationId: attestation.id,
      description: 'Signature does not match payload - attestation may be modified',
    });
  }

  // Recompute content hash and compare
  const computedHash = computeContentHash(payload);
  const contentHashValid = computedHash === attestation.contentHash;

  if (!contentHashValid) {
    issues.push({
      type: 'MODIFIED_PAYLOAD' as IssueType,
      severity: 'CRITICAL' as Severity,
      attestationId: attestation.id,
      description: 'Content hash mismatch - payload has been tampered with',
    });
  }

  return {
    valid: signatureValid && contentHashValid,
    signatureValid,
    contentHashValid,
    issues,
  };
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
