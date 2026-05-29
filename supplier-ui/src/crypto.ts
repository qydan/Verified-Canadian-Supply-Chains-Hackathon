/**
 * Client-side Ed25519 signing utilities.
 *
 * Provides canonicalization matching the backend (sort keys, remove whitespace, UTF-8 encode)
 * and Ed25519 keypair generation + signing using tweetnacl.
 *
 * Requirements: 13.2
 */

import nacl from 'tweetnacl';

/**
 * Recursively sorts object keys alphabetically at all nesting levels.
 * Arrays preserve element order; non-object primitives pass through unchanged.
 */
function deepSortKeys(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }

  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Canonicalizes a payload into a deterministic UTF-8 byte sequence.
 *
 * Process:
 * 1. Deep-sorts all object keys alphabetically at every nesting level
 * 2. Preserves array element order
 * 3. Serializes to JSON with no whitespace
 * 4. Encodes the resulting string as UTF-8 bytes
 */
export function canonicalize(obj: unknown): Uint8Array {
  const sorted = deepSortKeys(obj);
  const json = JSON.stringify(sorted);
  return new TextEncoder().encode(json);
}

/**
 * Converts a Uint8Array to a lowercase hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a new Ed25519 keypair, canonicalizes the payload, signs it,
 * and returns the hex-encoded signature and public key.
 */
export function signPayload(payload: object): { signature: string; publicKey: string } {
  const keyPair = nacl.sign.keyPair();
  const message = canonicalize(payload);
  const sig = nacl.sign.detached(message, keyPair.secretKey);

  return {
    signature: bytesToHex(sig),
    publicKey: bytesToHex(keyPair.publicKey),
  };
}
