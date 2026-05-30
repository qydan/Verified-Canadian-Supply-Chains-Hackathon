import { describe, it, expect } from 'vitest';
import { serialize, escapeString, formatNumber, canonicalSerialize, contentHash } from './canonical.js';

describe('escapeString', () => {
  it('wraps simple strings in double quotes', () => {
    expect(escapeString('hello')).toBe('"hello"');
  });

  it('escapes double quotes', () => {
    expect(escapeString('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('escapes backslashes', () => {
    expect(escapeString('a\\b')).toBe('"a\\\\b"');
  });

  it('escapes newline', () => {
    expect(escapeString('line1\nline2')).toBe('"line1\\nline2"');
  });

  it('escapes carriage return', () => {
    expect(escapeString('a\rb')).toBe('"a\\rb"');
  });

  it('escapes tab', () => {
    expect(escapeString('a\tb')).toBe('"a\\tb"');
  });

  it('escapes backspace', () => {
    expect(escapeString('a\bb')).toBe('"a\\bb"');
  });

  it('escapes form feed', () => {
    expect(escapeString('a\fb')).toBe('"a\\fb"');
  });

  it('escapes other control characters with \\u00XX', () => {
    // \x01 = SOH
    expect(escapeString('\x01')).toBe('"\\u0001"');
    // \x1f = US (last control char before space)
    expect(escapeString('\x1f')).toBe('"\\u001f"');
  });

  it('does NOT escape non-ASCII printable characters', () => {
    // French accented characters
    expect(escapeString('café')).toBe('"café"');
    // Chinese characters
    expect(escapeString('你好')).toBe('"你好"');
    // Emoji
    expect(escapeString('🎉')).toBe('"🎉"');
    // Japanese
    expect(escapeString('東京')).toBe('"東京"');
  });

  it('does NOT escape Unicode line/paragraph separators', () => {
    // \u2028 (line separator) and \u2029 (paragraph separator)
    // Python passes these through; JSON.stringify would escape them
    expect(escapeString('\u2028')).toBe('"\u2028"');
    expect(escapeString('\u2029')).toBe('"\u2029"');
  });

  it('handles empty string', () => {
    expect(escapeString('')).toBe('""');
  });
});

describe('formatNumber', () => {
  it('formats whole floats as integers', () => {
    expect(formatNumber(1.0)).toBe('1');
    expect(formatNumber(100.0)).toBe('100');
    expect(formatNumber(0.0)).toBe('0');
    expect(formatNumber(-5.0)).toBe('-5');
  });

  it('formats integers as integers', () => {
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-10)).toBe('-10');
  });

  it('formats non-whole floats with shortest representation', () => {
    expect(formatNumber(520.5)).toBe('520.5');
    expect(formatNumber(0.1)).toBe('0.1');
    expect(formatNumber(3.14)).toBe('3.14');
    expect(formatNumber(-2.5)).toBe('-2.5');
  });

  it('rejects NaN', () => {
    expect(() => formatNumber(NaN)).toThrow('Non-finite number');
  });

  it('rejects Infinity', () => {
    expect(() => formatNumber(Infinity)).toThrow('Non-finite number');
    expect(() => formatNumber(-Infinity)).toThrow('Non-finite number');
  });
});

describe('serialize', () => {
  it('serializes null', () => {
    expect(serialize(null)).toBe('null');
  });

  it('serializes undefined as null', () => {
    expect(serialize(undefined)).toBe('null');
  });

  it('serializes booleans', () => {
    expect(serialize(true)).toBe('true');
    expect(serialize(false)).toBe('false');
  });

  it('serializes numbers', () => {
    expect(serialize(42)).toBe('42');
    expect(serialize(1.0)).toBe('1');
    expect(serialize(520.5)).toBe('520.5');
  });

  it('serializes strings', () => {
    expect(serialize('hello')).toBe('"hello"');
    expect(serialize('café')).toBe('"café"');
  });

  it('serializes arrays', () => {
    expect(serialize([])).toBe('[]');
    expect(serialize([1, 2, 3])).toBe('[1,2,3]');
    expect(serialize(['a', 'b'])).toBe('["a","b"]');
  });

  it('serializes objects with sorted keys', () => {
    expect(serialize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(serialize({ z: 'last', a: 'first' })).toBe('{"a":"first","z":"last"}');
  });

  it('sorts keys alphabetically at every nesting level', () => {
    const obj = {
      z: { b: 2, a: 1 },
      a: { d: 4, c: 3 },
    };
    expect(serialize(obj)).toBe('{"a":{"c":3,"d":4},"z":{"a":1,"b":2}}');
  });

  it('produces compact JSON (no whitespace)', () => {
    const obj = { name: 'test', values: [1, 2, 3], nested: { key: 'val' } };
    const result = serialize(obj);
    // No spaces anywhere
    expect(result).not.toMatch(/[^\\] /);
    expect(result).toBe('{"name":"test","nested":{"key":"val"},"values":[1,2,3]}');
  });

  it('handles deeply nested structures', () => {
    const obj = { a: [{ c: true, b: null }] };
    expect(serialize(obj)).toBe('{"a":[{"b":null,"c":true}]}');
  });

  it('handles mixed arrays', () => {
    expect(serialize([null, true, 1, 'hi', { a: 1 }])).toBe('[null,true,1,"hi",{"a":1}]');
  });

  it('handles non-ASCII in object keys', () => {
    expect(serialize({ 'clé': 'valeur' })).toBe('{"clé":"valeur"}');
  });

  it('matches Python reference for attestation-like objects', () => {
    // Simulate a simplified attestation structure
    const attestation = {
      attestation_id: 'ATT-001',
      version: '1.0',
      supplier_id: 'SUP-001',
      timestamp: '2024-01-15T10:00:00Z',
      action_type: 'raw_material_supply',
      performed_in_country: 'CA',
      parents: [],
      output: {
        name: 'Raw Aluminum',
        quantity_produced: 100.0,
        unit: 'kg',
      },
      costs: {
        material_cad: 500.0,
        labour_hours: 8.0,
        labour_cost_cad: 200.0,
      },
    };

    const result = serialize(attestation);

    // Verify key sorting at top level and nested levels
    expect(result).toContain('"action_type":"raw_material_supply"');
    expect(result).toContain('"attestation_id":"ATT-001"');
    // Verify whole floats are integers
    expect(result).toContain('"quantity_produced":100');
    expect(result).toContain('"material_cad":500');
    expect(result).toContain('"labour_hours":8');

    // Verify the full output with sorted keys
    const expected =
      '{"action_type":"raw_material_supply","attestation_id":"ATT-001","costs":{"labour_cost_cad":200,"labour_hours":8,"material_cad":500},"output":{"name":"Raw Aluminum","quantity_produced":100,"unit":"kg"},"parents":[],"performed_in_country":"CA","supplier_id":"SUP-001","timestamp":"2024-01-15T10:00:00Z","version":"1.0"}';
    expect(result).toBe(expected);
  });
});


describe('canonicalSerialize', () => {
  it('returns a Uint8Array', () => {
    const result = canonicalSerialize({ a: 1 });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('encodes the canonical JSON as UTF-8 bytes', () => {
    const result = canonicalSerialize({ b: 1, a: 2 });
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toBe('{"a":2,"b":1}');
  });

  it('strips the signature key when excludeSignature is true (default)', () => {
    const obj = {
      attestation_id: 'test',
      signature: { algorithm: 'ed25519', value: 'abc123' },
      version: '1.0',
    };
    const result = canonicalSerialize(obj);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).not.toContain('signature');
    expect(decoded).toBe('{"attestation_id":"test","version":"1.0"}');
  });

  it('keeps the signature key when excludeSignature is false', () => {
    const obj = {
      attestation_id: 'test',
      signature: { algorithm: 'ed25519', value: 'abc123' },
      version: '1.0',
    };
    const result = canonicalSerialize(obj, false);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('signature');
    expect(decoded).toContain('"algorithm":"ed25519"');
  });

  it('handles non-ASCII characters in UTF-8 encoding', () => {
    const obj = { city: 'Gen\u00e8ve' };
    const result = canonicalSerialize(obj);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toBe('{"city":"Genève"}');
  });

  it('matches Python reference for golden attestation (signature excluded)', () => {
    const GOLDEN_ATT = {
      attestation_id: 'att-golden-0001',
      version: '1.0',
      supplier_id: 'sup-avss-corp',
      timestamp: '2026-04-15T14:30:00Z',
      action_type: 'component_manufacture',
      performed_in_country: 'CA',
      parents: [
        {
          attestation_id: 'att-parent-aaaa',
          content_hash: 'deadbeef',
          quantity_consumed: 8.0,
          unit: 'm2',
        },
      ],
      output: { name: 'Parachute Assembly', quantity_produced: 1, unit: 'units' },
      costs: { material_cad: 0.0, labour_hours: 6.5, labour_cost_cad: 520.0 },
    };

    const GOLDEN_CANON =
      '{"action_type":"component_manufacture","attestation_id":"att-golden-0001",' +
      '"costs":{"labour_cost_cad":520,"labour_hours":6.5,"material_cad":0},' +
      '"output":{"name":"Parachute Assembly","quantity_produced":1,"unit":"units"},' +
      '"parents":[{"attestation_id":"att-parent-aaaa","content_hash":"deadbeef",' +
      '"quantity_consumed":8,"unit":"m2"}],"performed_in_country":"CA",' +
      '"supplier_id":"sup-avss-corp","timestamp":"2026-04-15T14:30:00Z","version":"1.0"}';

    const result = canonicalSerialize(GOLDEN_ATT);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toBe(GOLDEN_CANON);
  });
});

describe('contentHash', () => {
  it('returns a lowercase hex string', () => {
    const result = contentHash({ a: 1 });
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces consistent hashes for the same input', () => {
    const obj = { attestation_id: 'test', version: '1.0' };
    expect(contentHash(obj)).toBe(contentHash(obj));
  });

  it('produces different hashes for different inputs', () => {
    const obj1 = { attestation_id: 'test1' };
    const obj2 = { attestation_id: 'test2' };
    expect(contentHash(obj1)).not.toBe(contentHash(obj2));
  });

  it('excludes signature from hash computation', () => {
    const withSig = {
      attestation_id: 'test',
      version: '1.0',
      signature: { algorithm: 'ed25519', value: 'somesig' },
    };
    const withoutSig = {
      attestation_id: 'test',
      version: '1.0',
    };
    expect(contentHash(withSig)).toBe(contentHash(withoutSig));
  });

  it('matches the golden vector from Python reference', () => {
    const GOLDEN_ATT = {
      attestation_id: 'att-golden-0001',
      version: '1.0',
      supplier_id: 'sup-avss-corp',
      timestamp: '2026-04-15T14:30:00Z',
      action_type: 'component_manufacture',
      performed_in_country: 'CA',
      parents: [
        {
          attestation_id: 'att-parent-aaaa',
          content_hash: 'deadbeef',
          quantity_consumed: 8.0,
          unit: 'm2',
        },
      ],
      output: { name: 'Parachute Assembly', quantity_produced: 1, unit: 'units' },
      costs: { material_cad: 0.0, labour_hours: 6.5, labour_cost_cad: 520.0 },
    };

    const GOLDEN_CHASH = '09aba57571d866025650689b5416bc17a77e1c44216ab3a70535962242ba506b';
    expect(contentHash(GOLDEN_ATT)).toBe(GOLDEN_CHASH);
  });
});
