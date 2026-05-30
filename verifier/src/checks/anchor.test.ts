import { describe, it, expect } from 'vitest';
import { checkAnchors } from './anchor.js';
import { contentHash } from '../canonical.js';
import type { OfficialAttestation } from '../types.js';
import type { AnchorEntry } from '../registry.js';

/**
 * Helper to create a minimal valid attestation for testing.
 */
function makeAttestation(overrides: Partial<OfficialAttestation> = {}): OfficialAttestation {
  return {
    attestation_id: 'att-001',
    version: '1.0',
    supplier_id: 'sup-001',
    timestamp: '2026-01-15T10:00:00Z',
    action_type: 'raw_material_supply',
    performed_in_country: 'CA',
    parents: [],
    output: { name: 'Widget', quantity_produced: 100, unit: 'kg' },
    costs: { material_cad: 500, labour_hours: 8, labour_cost_cad: 200 },
    signature: { algorithm: 'ed25519', value: 'dGVzdA==' },
    ...overrides,
  };
}

describe('checkAnchors', () => {
  it('returns no anomalies when attestation is not in the registry', () => {
    const att = makeAttestation({ attestation_id: 'att-not-anchored' });
    const anchors = new Map<string, AnchorEntry>();

    const anomalies = checkAnchors([att], anchors, 'prod-001');

    expect(anomalies).toEqual([]);
  });

  it('returns no anomalies when attestation is in registry with matching hash and same product', () => {
    const att = makeAttestation({ attestation_id: 'att-anchored' });
    const computed = contentHash(att as unknown as Record<string, unknown>);

    const anchors = new Map<string, AnchorEntry>([
      ['att-anchored', { attestation_id: 'att-anchored', content_hash: computed, product_id: 'prod-001' }],
    ]);

    const anomalies = checkAnchors([att], anchors, 'prod-001');

    expect(anomalies).toEqual([]);
  });

  it('reports anchor_mismatch when content hash differs from anchored hash', () => {
    const att = makeAttestation({ attestation_id: 'att-tampered' });

    const anchors = new Map<string, AnchorEntry>([
      ['att-tampered', { attestation_id: 'att-tampered', content_hash: 'deadbeef1234', product_id: 'prod-001' }],
    ]);

    const anomalies = checkAnchors([att], anchors, 'prod-001');

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      type: 'anchor_mismatch',
      attestation_id: 'att-tampered',
    });
    expect(anomalies[0].details).toContain('deadbeef1234');
  });

  it('reports replay_cross_chain when submitted under different product than anchored', () => {
    const att = makeAttestation({ attestation_id: 'att-replay' });
    const computed = contentHash(att as unknown as Record<string, unknown>);

    const anchors = new Map<string, AnchorEntry>([
      ['att-replay', { attestation_id: 'att-replay', content_hash: computed, product_id: 'prod-original' }],
    ]);

    // Submitted under prod-different, but anchored to prod-original
    const anomalies = checkAnchors([att], anchors, 'prod-different');

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      type: 'replay_cross_chain',
      attestation_id: 'att-replay',
    });
    expect(anomalies[0].details).toContain('prod-original');
    expect(anomalies[0].details).toContain('prod-different');
  });

  it('reports both anchor_mismatch and replay_cross_chain on same attestation', () => {
    const att = makeAttestation({ attestation_id: 'att-both' });

    const anchors = new Map<string, AnchorEntry>([
      ['att-both', { attestation_id: 'att-both', content_hash: 'wrong-hash', product_id: 'prod-original' }],
    ]);

    // Different product AND different hash
    const anomalies = checkAnchors([att], anchors, 'prod-different');

    expect(anomalies).toHaveLength(2);

    const types = anomalies.map((a) => a.type);
    expect(types).toContain('anchor_mismatch');
    expect(types).toContain('replay_cross_chain');

    // Both should reference the same attestation
    for (const anomaly of anomalies) {
      expect(anomaly.attestation_id).toBe('att-both');
    }
  });

  it('handles multiple attestations, some anchored some not', () => {
    const att1 = makeAttestation({ attestation_id: 'att-anchored-ok' });
    const att2 = makeAttestation({ attestation_id: 'att-not-anchored' });
    const att3 = makeAttestation({ attestation_id: 'att-anchored-bad' });

    const hash1 = contentHash(att1 as unknown as Record<string, unknown>);

    const anchors = new Map<string, AnchorEntry>([
      // att1: anchored with correct hash and same product → no anomaly
      ['att-anchored-ok', { attestation_id: 'att-anchored-ok', content_hash: hash1, product_id: 'prod-001' }],
      // att3: anchored with wrong hash → anchor_mismatch
      ['att-anchored-bad', { attestation_id: 'att-anchored-bad', content_hash: 'incorrect-hash', product_id: 'prod-001' }],
    ]);

    const anomalies = checkAnchors([att1, att2, att3], anchors, 'prod-001');

    // Only att3 should have an anomaly (anchor_mismatch)
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      type: 'anchor_mismatch',
      attestation_id: 'att-anchored-bad',
    });
  });
});
