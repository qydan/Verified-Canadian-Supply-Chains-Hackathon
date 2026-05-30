/**
 * Golden vector tests validating the TypeScript canonical serializer
 * against the Python reference library's test_golden.py.
 *
 * These tests use the exact same constants and assertions as the Python
 * reference to ensure byte-for-byte compatibility.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { serialize, canonicalSerialize, contentHash } from './canonical.js';

// ─── Golden constants from Python reference (test_golden.py) ───────────────

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

const GOLDEN_CHASH = '09aba57571d866025650689b5416bc17a77e1c44216ab3a70535962242ba506b';

// ─── test_canonical_rules (from Python reference) ──────────────────────────

describe('Golden vector: canonical rules (matching Python test_canonical_rules)', () => {
  it('sorts object keys alphabetically', () => {
    expect(serialize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('formats whole float 1.0 as integer "1"', () => {
    expect(serialize(1.0)).toBe('1');
  });

  it('formats whole float 8.0 as integer "8"', () => {
    expect(serialize(8.0)).toBe('8');
  });

  it('formats 520.50 as "520.5" (no trailing zeros)', () => {
    expect(serialize(520.5)).toBe('520.5');
  });

  it('formats 0.1 as "0.1"', () => {
    expect(serialize(0.1)).toBe('0.1');
  });

  it('serializes true, false, null correctly', () => {
    expect(serialize(true)).toBe('true');
    expect(serialize(false)).toBe('false');
    expect(serialize(null)).toBe('null');
  });

  it('handles mixed arrays with whole floats', () => {
    expect(serialize({ x: [1, 2.0, 3.5] })).toBe('{"x":[1,2,3.5]}');
  });

  it('sorts keys at nested levels', () => {
    expect(serialize({ z: { b: 1, a: 2 }, a: 1 })).toBe('{"a":1,"z":{"a":2,"b":1}}');
  });

  it('passes non-ASCII through as raw UTF-8 (Genève)', () => {
    expect(serialize({ city: 'Gen\u00e8ve' })).toBe('{"city":"Genève"}');
  });
});

// ─── test_canonical_rejects_non_finite (from Python reference) ─────────────

describe('Golden vector: rejects non-finite numbers', () => {
  it('rejects NaN', () => {
    expect(() => serialize(NaN)).toThrow();
  });

  it('rejects Infinity', () => {
    expect(() => serialize(Infinity)).toThrow();
  });

  it('rejects -Infinity', () => {
    expect(() => serialize(-Infinity)).toThrow();
  });
});

// ─── test_golden_canonical_and_hash (from Python reference) ────────────────

describe('Golden vector: canonical serialization and content hash', () => {
  it('produces the exact GOLDEN_CANON string (signature excluded)', () => {
    const bytes = canonicalSerialize(GOLDEN_ATT, true);
    const result = new TextDecoder().decode(bytes);
    expect(result).toBe(GOLDEN_CANON);
  });

  it('produces the exact GOLDEN_CHASH content hash', () => {
    const hash = contentHash(GOLDEN_ATT);
    expect(hash).toBe(GOLDEN_CHASH);
  });

  it('signature exclusion strips the signature key', () => {
    const attWithSig = {
      ...GOLDEN_ATT,
      signature: { algorithm: 'ed25519', value: 'somesig==' },
    };
    const bytes = canonicalSerialize(attWithSig, true);
    const result = new TextDecoder().decode(bytes);
    // Should be identical to GOLDEN_CANON (signature stripped)
    expect(result).toBe(GOLDEN_CANON);
  });

  it('without signature exclusion, includes signature key', () => {
    const attWithSig = {
      ...GOLDEN_ATT,
      signature: { algorithm: 'ed25519', value: 'somesig==' },
    };
    const bytes = canonicalSerialize(attWithSig, false);
    const result = new TextDecoder().decode(bytes);
    // Should contain the signature key
    expect(result).toContain('"signature"');
    expect(result).toContain('"algorithm":"ed25519"');
  });
});

// ─── Round-trip property (Requirement 3.7) ─────────────────────────────────

describe('Golden vector: round-trip idempotence', () => {
  it('serialize → parse → serialize produces identical output for GOLDEN_ATT', () => {
    const first = serialize(GOLDEN_ATT);
    const parsed = JSON.parse(first);
    const second = serialize(parsed);
    expect(second).toBe(first);
  });

  it('serialize → parse → serialize for nested objects with numbers', () => {
    const obj = { costs: { material_cad: 0.0, labour_hours: 6.5, labour_cost_cad: 520.0 } };
    const first = serialize(obj);
    const parsed = JSON.parse(first);
    const second = serialize(parsed);
    expect(second).toBe(first);
  });
});

// ─── Worked example: recovery drone chain content hashes ───────────────────

describe('Golden vector: worked example (recovery_drone_chain.json)', () => {
  const chainPath = resolve(
    __dirname,
    '../../provenance-hackathon-main/worked-example/recovery_drone_chain.json'
  );
  const chain = JSON.parse(readFileSync(chainPath, 'utf-8'));
  const attestations: Record<string, unknown>[] = chain.attestations;

  // Build a lookup map: attestation_id → attestation
  const attMap = new Map<string, Record<string, unknown>>();
  for (const att of attestations) {
    attMap.set(att.attestation_id as string, att);
  }

  it('computes correct content hash for each attestation', () => {
    // For each attestation that is referenced as a parent, verify the content_hash
    for (const att of attestations) {
      const parents = att.parents as Array<{
        attestation_id: string;
        content_hash: string;
      }>;
      if (!parents || parents.length === 0) continue;

      for (const parentRef of parents) {
        const parentAtt = attMap.get(parentRef.attestation_id);
        if (!parentAtt) continue;

        const computed = contentHash(parentAtt);
        expect(computed).toBe(parentRef.content_hash);
      }
    }
  });

  it('computes correct content hash for att-anchor-0001 (first raw material)', () => {
    const att = attMap.get('att-anchor-0001')!;
    const hash = contentHash(att);
    // This hash is referenced by att-anchor-0005's first parent
    expect(hash).toBe('1ed6d6cc7b1526c7473ad8532a6f8ae5e17470bc09434f5da51e9d33c2cddaa4');
  });

  it('computes correct content hash for att-anchor-0005 (parachute assembly)', () => {
    const att = attMap.get('att-anchor-0005')!;
    const hash = contentHash(att);
    // This hash is referenced by att-anchor-0012's first parent
    expect(hash).toBe('d27cc6a9997e233e82f0b9cf0bd6c960b4dd68428f86485382914c91dbfe1faf');
  });

  it('computes correct content hash for att-anchor-0011 (Nanuk case)', () => {
    const att = attMap.get('att-anchor-0011')!;
    const hash = contentHash(att);
    // This hash is referenced by att-anchor-0012's last parent
    expect(hash).toBe('e40eae866395c19824c796c09a95173b4f1ff61c4299bdffbb0474ad7f9e2d50');
  });

  it('all parent hash references in the chain are valid', () => {
    let totalChecked = 0;
    for (const att of attestations) {
      const parents = att.parents as Array<{
        attestation_id: string;
        content_hash: string;
      }>;
      if (!parents) continue;

      for (const parentRef of parents) {
        const parentAtt = attMap.get(parentRef.attestation_id);
        if (!parentAtt) continue;

        const computed = contentHash(parentAtt);
        expect(computed).toBe(parentRef.content_hash);
        totalChecked++;
      }
    }
    // The worked example has 11 parent references total
    expect(totalChecked).toBeGreaterThanOrEqual(11);
  });
});
