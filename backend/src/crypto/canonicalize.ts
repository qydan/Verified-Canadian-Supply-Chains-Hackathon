/**
 * Payload canonicalization for deterministic signature verification.
 *
 * Produces a canonical byte representation of a JSON-serializable value by:
 * 1. Deep-sorting object keys alphabetically at all nesting levels
 * 2. Preserving array element order
 * 3. Removing all whitespace from the JSON output
 * 4. Encoding the resulting string as UTF-8 bytes
 *
 * Requirements: 4.1, 4.2
 */

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

  // Primitives (string, number, boolean) pass through unchanged
  return value;
}

/**
 * Canonicalizes a payload into a deterministic UTF-8 byte sequence.
 *
 * The canonicalization process:
 * 1. Deep-sorts all object keys alphabetically at every nesting level
 * 2. Preserves array element order
 * 3. Serializes to JSON with no whitespace (JSON.stringify with no spacer)
 * 4. Encodes the resulting string as UTF-8 bytes via TextEncoder
 *
 * This ensures that the same logical payload always produces identical bytes,
 * regardless of the original key ordering in the source object.
 */
export function canonicalize(payload: unknown): Uint8Array {
  const sorted = deepSortKeys(payload);
  const json = JSON.stringify(sorted);
  return new TextEncoder().encode(json);
}
