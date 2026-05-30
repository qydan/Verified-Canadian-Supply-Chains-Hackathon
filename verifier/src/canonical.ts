/**
 * Canonical serialization for provenance attestations.
 *
 * Implements byte-exact rules matching the Python reference (canonical.py):
 *   1. JSON, keys sorted alphabetically at every nesting level.
 *   2. No insignificant whitespace (compact separators ',' and ':').
 *   3. UTF-8 encoding; printable non-ASCII emitted as raw UTF-8 (NOT \uXXXX).
 *      Only control chars (< 0x20) and JSON-required chars are escaped.
 *   4. Whole numbers serialize as integers (1, not 1.0); non-whole as floats
 *      with no trailing zeros.
 *   5. No NaN / Infinity.
 *
 * CRITICAL: We cannot use JSON.stringify because it escapes non-ASCII characters
 * as \uXXXX sequences. The Python reference passes them through as raw UTF-8.
 */

import { sha256 } from '@noble/hashes/sha256';

/**
 * Escape a string for JSON output, matching the Python reference behavior.
 * Only escapes: ", \, and control characters < 0x20.
 * Non-ASCII printable characters (>= 0x20) pass through as-is (raw UTF-8).
 */
export function escapeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);

    if (ch === '"') {
      out += '\\"';
    } else if (ch === '\\') {
      out += '\\\\';
    } else if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\r') {
      out += '\\r';
    } else if (ch === '\t') {
      out += '\\t';
    } else if (ch === '\b') {
      out += '\\b';
    } else if (ch === '\f') {
      out += '\\f';
    } else if (code < 0x20) {
      // Other control characters: use \u00XX format
      out += '\\u' + code.toString(16).padStart(4, '0');
    } else {
      // All printable characters (including non-ASCII) pass through as-is
      out += ch;
    }
  }
  out += '"';
  return out;
}

/**
 * Format a number for canonical JSON output.
 * - Whole floats serialize as integers (1.0 → "1")
 * - Non-whole floats use shortest representation (no trailing zeros)
 * - NaN and Infinity are rejected
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`Non-finite number not allowed in canonical form: ${n}`);
  }

  // If the number is a whole number (integer value), serialize as integer
  if (Number.isInteger(n)) {
    // Use String() which gives us the integer representation for whole numbers
    return String(n);
  }

  // Non-whole: use JavaScript's default string representation which gives
  // the shortest round-trippable decimal (same as Python's repr for floats)
  const s = String(n);

  // Reject scientific notation (shouldn't happen for typical attestation values)
  if (s.includes('e') || s.includes('E')) {
    throw new Error(`Scientific notation not supported in canonical form: ${s}`);
  }

  return s;
}

/**
 * Serialize a value to canonical JSON string.
 * Handles: null, boolean, number, string, array, object.
 * Objects have keys sorted alphabetically at every nesting level.
 * Produces compact JSON (no whitespace between tokens).
 */
export function serialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return formatNumber(value);
  }

  if (typeof value === 'string') {
    return escapeString(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => serialize(item));
    return '[' + items.join(',') + ']';
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => escapeString(key) + ':' + serialize(obj[key]));
    return '{' + pairs.join(',') + '}';
  }

  throw new TypeError(`Unsupported type in canonical form: ${typeof value}`);
}

/**
 * Canonical serialization with optional signature exclusion.
 * Returns UTF-8 bytes (Uint8Array) ready for hashing or signature verification.
 *
 * When excludeSignature is true (default), the top-level `signature` key is
 * stripped before serialization — used for both signing and content hashing.
 */
export function canonicalSerialize(
  attestation: Record<string, unknown>,
  excludeSignature: boolean = true
): Uint8Array {
  let obj = attestation;
  if (excludeSignature && typeof attestation === 'object' && attestation !== null) {
    const { signature, ...rest } = attestation;
    obj = rest;
  }
  const jsonStr = serialize(obj);
  return new TextEncoder().encode(jsonStr);
}

/**
 * Compute SHA-256 content hash (lowercase hex) of the canonical form,
 * with signature excluded.
 *
 * This is the value used for parents[].content_hash and the anchor registry.
 */
export function contentHash(attestation: Record<string, unknown>): string {
  const bytes = canonicalSerialize(attestation, true);
  const hash = sha256(bytes);
  // Convert to lowercase hex string
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
