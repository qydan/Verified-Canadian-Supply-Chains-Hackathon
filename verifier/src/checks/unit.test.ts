import { describe, it, expect } from 'vitest';
import { checkUnits } from './unit.js';
import type { OfficialAttestation } from '../types.js';

/**
 * Helper to create a minimal valid attestation for testing.
 */
function makeAttestation(overrides: Partial<OfficialAttestation> = {}): OfficialAttestation {
  return {
    attestation_id: 'att-child-001',
    version: '1.0',
    supplier_id: 'sup-test',
    timestamp: '2026-01-01T00:00:00Z',
    action_type: 'component_manufacture',
    performed_in_country: 'CA',
    parents: [],
    output: { name: 'Widget', quantity_produced: 10, unit: 'units' },
    costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
    signature: { algorithm: 'ed25519', value: 'dGVzdA==' },
    ...overrides,
  };
}

describe('checkUnits', () => {
  it('returns no anomalies when units match', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
      output: { name: 'Steel Rod', quantity_produced: 100, unit: 'kg' },
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'some_hash',
          quantity_consumed: 50,
          unit: 'kg',
        },
      ],
    });

    const anomalies = checkUnits([parent, child]);
    expect(anomalies).toEqual([]);
  });

  it('detects unit mismatch (child references "kg" but parent produces "m2")', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
      output: { name: 'Panel', quantity_produced: 50, unit: 'm2' },
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'some_hash',
          quantity_consumed: 10,
          unit: 'kg',
        },
      ],
    });

    const anomalies = checkUnits([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('unit_mismatch');
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].details).toContain('att-parent-001');
    expect(anomalies[0].details).toContain('kg');
    expect(anomalies[0].details).toContain('m2');
  });

  it('detects multiple mismatches on the same child', () => {
    const parent1 = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
      output: { name: 'Part A', quantity_produced: 10, unit: 'kg' },
    });

    const parent2 = makeAttestation({
      attestation_id: 'att-parent-002',
      parents: [],
      output: { name: 'Part B', quantity_produced: 20, unit: 'litres' },
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'hash1',
          quantity_consumed: 5,
          unit: 'lbs',  // mismatch: parent produces "kg"
        },
        {
          attestation_id: 'att-parent-002',
          content_hash: 'hash2',
          quantity_consumed: 10,
          unit: 'gallons',  // mismatch: parent produces "litres"
        },
      ],
    });

    const anomalies = checkUnits([parent1, parent2, child]);
    expect(anomalies).toHaveLength(2);
    expect(anomalies[0].type).toBe('unit_mismatch');
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].details).toContain('att-parent-001');
    expect(anomalies[1].type).toBe('unit_mismatch');
    expect(anomalies[1].attestation_id).toBe('att-child-001');
    expect(anomalies[1].details).toContain('att-parent-002');
  });

  it('skips dangling parents (not in the submitted chain)', () => {
    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-nonexistent-parent',
          content_hash: 'some_hash',
          quantity_consumed: 5,
          unit: 'kg',
        },
      ],
    });

    // Only the child is in the chain, parent is missing
    const anomalies = checkUnits([child]);
    expect(anomalies).toEqual([]);
  });

  it('performs case-sensitive comparison (units must match exactly)', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
      output: { name: 'Material', quantity_produced: 100, unit: 'Kg' },
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'some_hash',
          quantity_consumed: 50,
          unit: 'kg',  // lowercase vs parent's "Kg"
        },
      ],
    });

    const anomalies = checkUnits([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('unit_mismatch');
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].details).toContain('kg');
    expect(anomalies[0].details).toContain('Kg');
  });

  it('handles a chain with no parent references (root attestations only)', () => {
    const root1 = makeAttestation({
      attestation_id: 'att-root-001',
      parents: [],
    });
    const root2 = makeAttestation({
      attestation_id: 'att-root-002',
      parents: [],
    });

    const anomalies = checkUnits([root1, root2]);
    expect(anomalies).toEqual([]);
  });

  it('reports anomaly on child, not on parent', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
      output: { name: 'Material', quantity_produced: 100, unit: 'metres' },
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'some_hash',
          quantity_consumed: 50,
          unit: 'feet',
        },
      ],
    });

    const anomalies = checkUnits([parent, child]);
    expect(anomalies).toHaveLength(1);
    // The anomaly should be on the CHILD (the one with the mismatched reference)
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    // NOT on the parent
    expect(anomalies[0].attestation_id).not.toBe('att-parent-001');
  });
});
