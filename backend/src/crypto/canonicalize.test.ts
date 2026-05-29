import { describe, it, expect } from 'vitest';
import { canonicalize } from './canonicalize.js';

describe('canonicalize', () => {
  it('should sort object keys alphabetically', () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should sort nested object keys recursively', () => {
    const result = canonicalize({ b: { z: 1, a: 2 }, a: { y: 3, x: 4 } });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"a":{"x":4,"y":3},"b":{"a":2,"z":1}}');
  });

  it('should preserve array element order', () => {
    const result = canonicalize({ items: [3, 1, 2] });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"items":[3,1,2]}');
  });

  it('should sort keys inside objects within arrays', () => {
    const result = canonicalize({ arr: [{ z: 1, a: 2 }, { b: 3, a: 4 }] });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"arr":[{"a":2,"z":1},{"a":4,"b":3}]}');
  });

  it('should produce identical bytes for same logical payload with different key order', () => {
    const payload1 = { name: 'test', cost: 100, location: 'CA' };
    const payload2 = { location: 'CA', name: 'test', cost: 100 };
    const payload3 = { cost: 100, location: 'CA', name: 'test' };

    const result1 = canonicalize(payload1);
    const result2 = canonicalize(payload2);
    const result3 = canonicalize(payload3);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it('should handle null values', () => {
    const result = canonicalize({ a: null, b: 1 });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"a":null,"b":1}');
  });

  it('should handle boolean values', () => {
    const result = canonicalize({ isActive: true, isDeleted: false });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"isActive":true,"isDeleted":false}');
  });

  it('should handle string values with special characters', () => {
    const result = canonicalize({ name: 'hello "world"', desc: 'line\nnew' });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"desc":"line\\nnew","name":"hello \\"world\\""}');
  });

  it('should handle empty objects', () => {
    const result = canonicalize({});
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{}');
  });

  it('should handle empty arrays', () => {
    const result = canonicalize({ items: [] });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"items":[]}');
  });

  it('should handle deeply nested structures', () => {
    const result = canonicalize({
      c: { b: { a: { z: 'deep' } } },
      a: 1,
    });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"a":1,"c":{"b":{"a":{"z":"deep"}}}}');
  });

  it('should produce no whitespace in output', () => {
    const result = canonicalize({ key: 'value', nested: { a: [1, 2, 3] } });
    const json = new TextDecoder().decode(result);
    expect(json).not.toMatch(/\s/);
  });

  it('should return Uint8Array', () => {
    const result = canonicalize({ test: true });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should encode as valid UTF-8', () => {
    const result = canonicalize({ emoji: '🇨🇦', text: 'café' });
    const decoded = new TextDecoder().decode(result);
    const parsed = JSON.parse(decoded);
    expect(parsed.emoji).toBe('🇨🇦');
    expect(parsed.text).toBe('café');
  });

  it('should handle a realistic attestation payload', () => {
    const payload = {
      productName: 'Maple Syrup',
      productId: '550e8400-e29b-41d4-a716-446655440000',
      supplierId: 'supplier-001',
      location: 'CA',
      materialCost: 50.0,
      labourCost: 25.0,
      currency: 'CAD',
      outputQuantity: 100,
      outputUnit: 'L',
      timestamp: '2024-01-15T10:30:00Z',
      isTransformation: true,
      inputs: [
        { attestationId: 'input-001', quantityUsed: 200, unit: 'kg' },
      ],
    };

    // Same payload with shuffled keys
    const shuffled = {
      timestamp: '2024-01-15T10:30:00Z',
      inputs: [
        { unit: 'kg', attestationId: 'input-001', quantityUsed: 200 },
      ],
      outputUnit: 'L',
      productName: 'Maple Syrup',
      isTransformation: true,
      location: 'CA',
      supplierId: 'supplier-001',
      materialCost: 50.0,
      outputQuantity: 100,
      labourCost: 25.0,
      currency: 'CAD',
      productId: '550e8400-e29b-41d4-a716-446655440000',
    };

    expect(canonicalize(payload)).toEqual(canonicalize(shuffled));
  });

  it('should handle numeric edge cases', () => {
    const result = canonicalize({ zero: 0, negative: -1, float: 3.14 });
    const json = new TextDecoder().decode(result);
    expect(json).toBe('{"float":3.14,"negative":-1,"zero":0}');
  });

  it('should handle top-level primitives', () => {
    expect(new TextDecoder().decode(canonicalize('hello'))).toBe('"hello"');
    expect(new TextDecoder().decode(canonicalize(42))).toBe('42');
    expect(new TextDecoder().decode(canonicalize(true))).toBe('true');
    expect(new TextDecoder().decode(canonicalize(null))).toBe('null');
  });

  it('should handle top-level arrays', () => {
    const result = canonicalize([{ b: 1, a: 2 }, { d: 3, c: 4 }]);
    const json = new TextDecoder().decode(result);
    expect(json).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });
});
