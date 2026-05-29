import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { verifySignature, computeContentHash, verifyAttestation } from './signature.js';
import { canonicalize } from './canonicalize.js';
import type { Attestation } from '../types.js';

describe('verifySignature', () => {
  it('should return true for a valid signature', () => {
    const keyPair = nacl.sign.keyPair();
    const message = new TextEncoder().encode('hello world');
    const signature = nacl.sign.detached(message, keyPair.secretKey);

    expect(verifySignature(message, signature, keyPair.publicKey)).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const keyPair = nacl.sign.keyPair();
    const message = new TextEncoder().encode('hello world');
    const signature = nacl.sign.detached(message, keyPair.secretKey);

    // Tamper with the message
    const tampered = new TextEncoder().encode('hello world!');
    expect(verifySignature(tampered, signature, keyPair.publicKey)).toBe(false);
  });

  it('should return false for wrong public key', () => {
    const keyPair1 = nacl.sign.keyPair();
    const keyPair2 = nacl.sign.keyPair();
    const message = new TextEncoder().encode('test message');
    const signature = nacl.sign.detached(message, keyPair1.secretKey);

    expect(verifySignature(message, signature, keyPair2.publicKey)).toBe(false);
  });

  it('should return false if signature is not 64 bytes (Requirement 4.5)', () => {
    const keyPair = nacl.sign.keyPair();
    const message = new TextEncoder().encode('test');

    // Too short
    expect(verifySignature(message, new Uint8Array(63), keyPair.publicKey)).toBe(false);
    // Too long
    expect(verifySignature(message, new Uint8Array(65), keyPair.publicKey)).toBe(false);
    // Empty
    expect(verifySignature(message, new Uint8Array(0), keyPair.publicKey)).toBe(false);
  });

  it('should return false if public key is not 32 bytes (Requirement 4.5)', () => {
    const message = new TextEncoder().encode('test');
    const signature = new Uint8Array(64);

    // Too short
    expect(verifySignature(message, signature, new Uint8Array(31))).toBe(false);
    // Too long
    expect(verifySignature(message, signature, new Uint8Array(33))).toBe(false);
    // Empty
    expect(verifySignature(message, signature, new Uint8Array(0))).toBe(false);
  });
});

describe('computeContentHash', () => {
  it('should return a 64-character lowercase hex string (Requirement 4.4)', () => {
    const hash = computeContentHash({ test: 'value' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce the same hash for same logical payload with different key order', () => {
    const hash1 = computeContentHash({ b: 2, a: 1 });
    const hash2 = computeContentHash({ a: 1, b: 2 });
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different payloads', () => {
    const hash1 = computeContentHash({ value: 1 });
    const hash2 = computeContentHash({ value: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it('should handle complex nested payloads', () => {
    const payload = {
      productName: 'Maple Syrup',
      inputs: [{ attestationId: 'abc', quantityUsed: 10, unit: 'kg' }],
      materialCost: 50.0,
    };
    const hash = computeContentHash(payload);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyAttestation', () => {
  function createValidAttestation(): Attestation {
    const keyPair = nacl.sign.keyPair();

    const payload = {
      productName: 'Test Product',
      productId: 'prod-001',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 100,
      labourCost: 50,
      currency: 'CAD',
      outputQuantity: 10,
      outputUnit: 'kg',
      timestamp: '2024-01-15T10:00:00Z',
      isTransformation: true,
      inputs: [],
    };

    // Canonicalize and sign
    const canonicalBytes = canonicalize(payload);
    const signature = nacl.sign.detached(canonicalBytes, keyPair.secretKey);

    // Compute content hash
    const contentHash = computeContentHash(payload);

    return {
      id: 'att-001',
      contentHash,
      supplierId: payload.supplierId,
      publicKey: bytesToHex(keyPair.publicKey),
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
  }

  it('should return valid=true for a correctly signed attestation (Requirement 4.6)', () => {
    const attestation = createValidAttestation();
    const result = verifyAttestation(attestation);

    expect(result.valid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.contentHashValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect invalid signature when payload is tampered', () => {
    const attestation = createValidAttestation();
    attestation.productName = 'Tampered Product';

    const result = verifyAttestation(attestation);

    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(false);
    expect(result.issues.some(i => i.type === 'INVALID_SIGNATURE')).toBe(true);
  });

  it('should detect content hash mismatch', () => {
    const attestation = createValidAttestation();
    attestation.contentHash = 'a'.repeat(64); // Wrong hash

    const result = verifyAttestation(attestation);

    expect(result.valid).toBe(false);
    expect(result.contentHashValid).toBe(false);
    expect(result.issues.some(i => i.type === 'MODIFIED_PAYLOAD')).toBe(true);
  });

  it('should report both issues when signature and hash are invalid', () => {
    const attestation = createValidAttestation();
    attestation.productName = 'Tampered';
    attestation.contentHash = 'b'.repeat(64);

    const result = verifyAttestation(attestation);

    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(false);
    expect(result.contentHashValid).toBe(false);
    expect(result.issues).toHaveLength(2);
  });
});

/** Helper to convert bytes to hex */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
