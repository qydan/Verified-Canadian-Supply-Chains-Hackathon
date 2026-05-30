import { describe, it, expect } from 'vitest';
import { checkTimestamps } from './timestamp.js';
import type { OfficialAttestation } from '../types.js';

/**
 * Helper to create a minimal valid attestation for testing.
 */
function makeAttestation(overrides: Partial<OfficialAttestation> = {}): OfficialAttestation {
  return {
    attestation_id: 'att-child-001',
    version: '1.0',
    supplier_id: 'sup-test',
    timestamp: '2026-04-15T14:30:00Z',
    action_type: 'component_manufacture',
    performed_in_country: 'CA',
    parents: [],
    output: { name: 'Widget', quantity_produced: 10, unit: 'units' },
    costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
    signature: { algorithm: 'ed25519', value: 'dGVzdA==' },
    ...overrides,
  };
}

describe('checkTimestamps', () => {
  it('returns no anomalies when parent is earlier than child', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      timestamp: '2026-04-10T10:00:00Z',
      parents: [],
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'abc123',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkTimestamps([parent, child]);
    expect(anomalies).toEqual([]);
  });

  it('detects inversion when parent is later than child', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      timestamp: '2026-04-20T10:00:00Z',
      parents: [],
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'abc123',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkTimestamps([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('timestamp_inversion');
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].details).toContain('att-parent-001');
    expect(anomalies[0].details).toContain('2026-04-20T10:00:00Z');
    expect(anomalies[0].details).toContain('2026-04-15T14:30:00Z');
  });

  it('returns no anomalies when timestamps are equal (not strictly later)', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [],
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'abc123',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkTimestamps([parent, child]);
    expect(anomalies).toEqual([]);
  });

  it('detects multiple inversions on the same child', () => {
    const parent1 = makeAttestation({
      attestation_id: 'att-parent-001',
      timestamp: '2026-04-20T10:00:00Z',
      parents: [],
    });

    const parent2 = makeAttestation({
      attestation_id: 'att-parent-002',
      timestamp: '2026-04-25T08:00:00Z',
      parents: [],
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'abc123',
          quantity_consumed: 5,
          unit: 'units',
        },
        {
          attestation_id: 'att-parent-002',
          content_hash: 'def456',
          quantity_consumed: 3,
          unit: 'kg',
        },
      ],
    });

    const anomalies = checkTimestamps([parent1, parent2, child]);
    expect(anomalies).toHaveLength(2);
    expect(anomalies[0].type).toBe('timestamp_inversion');
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].details).toContain('att-parent-001');
    expect(anomalies[1].type).toBe('timestamp_inversion');
    expect(anomalies[1].attestation_id).toBe('att-child-001');
    expect(anomalies[1].details).toContain('att-parent-002');
  });

  it('skips dangling parents (not in the submitted chain)', () => {
    const child = makeAttestation({
      attestation_id: 'att-child-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [
        {
          attestation_id: 'att-nonexistent-parent',
          content_hash: 'some_hash',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkTimestamps([child]);
    expect(anomalies).toEqual([]);
  });

  it('handles a chain with no parent references (root attestations only)', () => {
    const root1 = makeAttestation({
      attestation_id: 'att-root-001',
      timestamp: '2026-04-10T10:00:00Z',
      parents: [],
    });
    const root2 = makeAttestation({
      attestation_id: 'att-root-002',
      timestamp: '2026-04-12T10:00:00Z',
      parents: [],
    });

    const anomalies = checkTimestamps([root1, root2]);
    expect(anomalies).toEqual([]);
  });

  it('reports anomaly on child, not on parent', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      timestamp: '2026-04-20T10:00:00Z',
      parents: [],
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'abc123',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkTimestamps([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].attestation_id).not.toBe('att-parent-001');
  });

  it('only flags inversions, not valid ordering in a multi-level chain', () => {
    const grandparent = makeAttestation({
      attestation_id: 'att-gp-001',
      timestamp: '2026-04-01T10:00:00Z',
      parents: [],
    });

    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      timestamp: '2026-04-10T10:00:00Z',
      parents: [
        {
          attestation_id: 'att-gp-001',
          content_hash: 'hash1',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    // Child has valid timestamp relative to parent, but parent has inversion with grandparent
    const child = makeAttestation({
      attestation_id: 'att-child-001',
      timestamp: '2026-04-15T14:30:00Z',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'hash2',
          quantity_consumed: 3,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkTimestamps([grandparent, parent, child]);
    // All timestamps are in order: gp < parent < child
    expect(anomalies).toEqual([]);
  });
});
