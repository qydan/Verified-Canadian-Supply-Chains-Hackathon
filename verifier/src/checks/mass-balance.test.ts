import { describe, it, expect } from 'vitest';
import { checkMassBalance } from './mass-balance.js';
import type { OfficialAttestation } from '../types.js';

/** Helper to create a minimal attestation for mass-balance testing */
function makeAttestation(
  id: string,
  quantityProduced: number,
  parents: { attestation_id: string; quantity_consumed: number }[] = []
): OfficialAttestation {
  return {
    attestation_id: id,
    version: '1.0',
    supplier_id: 'supplier-1',
    timestamp: '2024-01-01T00:00:00Z',
    action_type: 'raw_material_supply',
    performed_in_country: 'CA',
    parents: parents.map((p) => ({
      attestation_id: p.attestation_id,
      content_hash: 'hash-placeholder',
      quantity_consumed: p.quantity_consumed,
      unit: 'kg',
    })),
    output: {
      name: 'test-output',
      quantity_produced: quantityProduced,
      unit: 'kg',
    },
    costs: {
      material_cad: 100,
      labour_hours: 2,
      labour_cost_cad: 50,
    },
    signature: {
      algorithm: 'Ed25519',
      value: 'placeholder-sig',
    },
  };
}

describe('checkMassBalance', () => {
  it('returns no anomalies when consumption equals production', () => {
    const parent = makeAttestation('parent-1', 100);
    const child = makeAttestation('child-1', 50, [
      { attestation_id: 'parent-1', quantity_consumed: 100 },
    ]);

    const anomalies = checkMassBalance([parent, child]);
    expect(anomalies).toEqual([]);
  });

  it('returns no anomalies when under-consumed (leftover)', () => {
    const parent = makeAttestation('parent-1', 100);
    const child = makeAttestation('child-1', 50, [
      { attestation_id: 'parent-1', quantity_consumed: 60 },
    ]);

    const anomalies = checkMassBalance([parent, child]);
    expect(anomalies).toEqual([]);
  });

  it('reports violation when over-consumed by a single consumer', () => {
    const parent = makeAttestation('parent-1', 100);
    const child = makeAttestation('child-1', 50, [
      { attestation_id: 'parent-1', quantity_consumed: 101 },
    ]);

    const anomalies = checkMassBalance([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('mass_balance_violation');
    expect(anomalies[0].attestation_id).toBe('parent-1');
  });

  it('reports violation when over-consumed by multiple consumers aggregated', () => {
    const parent = makeAttestation('parent-1', 100);
    const child1 = makeAttestation('child-1', 50, [
      { attestation_id: 'parent-1', quantity_consumed: 60 },
    ]);
    const child2 = makeAttestation('child-2', 50, [
      { attestation_id: 'parent-1', quantity_consumed: 50 },
    ]);

    // 60 + 50 = 110 > 100 → violation
    const anomalies = checkMassBalance([parent, child1, child2]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('mass_balance_violation');
    expect(anomalies[0].attestation_id).toBe('parent-1');
  });

  it('does not flag when consumed = produced + 1e-7 (within epsilon)', () => {
    const parent = makeAttestation('parent-1', 100);
    const child = makeAttestation('child-1', 50, [
      { attestation_id: 'parent-1', quantity_consumed: 100 + 1e-7 },
    ]);

    const anomalies = checkMassBalance([parent, child]);
    expect(anomalies).toEqual([]);
  });

  it('flags when consumed = produced + 1e-5 (exceeds epsilon)', () => {
    const parent = makeAttestation('parent-1', 100);
    const child = makeAttestation('child-1', 50, [
      { attestation_id: 'parent-1', quantity_consumed: 100 + 1e-5 },
    ]);

    const anomalies = checkMassBalance([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('mass_balance_violation');
    expect(anomalies[0].attestation_id).toBe('parent-1');
  });

  it('attributes anomaly to the parent P, not the child', () => {
    const parent = makeAttestation('parent-node', 50);
    const child = makeAttestation('child-node', 30, [
      { attestation_id: 'parent-node', quantity_consumed: 60 },
    ]);

    const anomalies = checkMassBalance([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].attestation_id).toBe('parent-node');
    // Should NOT be attributed to child-node
    expect(anomalies[0].attestation_id).not.toBe('child-node');
  });

  it('detects violation in diamond DAG: shared node consumed by two children', () => {
    // Diamond structure:
    //   raw (produces 100)
    //     ├── branch-a (consumes 70 from raw)
    //     └── branch-b (consumes 40 from raw)
    //   final (consumes from branch-a and branch-b)
    //
    // Total consumed from raw = 70 + 40 = 110 > 100 → violation on raw

    const raw = makeAttestation('raw', 100);
    const branchA = makeAttestation('branch-a', 50, [
      { attestation_id: 'raw', quantity_consumed: 70 },
    ]);
    const branchB = makeAttestation('branch-b', 50, [
      { attestation_id: 'raw', quantity_consumed: 40 },
    ]);
    const final = makeAttestation('final', 80, [
      { attestation_id: 'branch-a', quantity_consumed: 50 },
      { attestation_id: 'branch-b', quantity_consumed: 50 },
    ]);

    const anomalies = checkMassBalance([raw, branchA, branchB, final]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('mass_balance_violation');
    expect(anomalies[0].attestation_id).toBe('raw');
  });

  it('handles chain with no parent references (no violations possible)', () => {
    const raw = makeAttestation('raw-1', 100);
    const anomalies = checkMassBalance([raw]);
    expect(anomalies).toEqual([]);
  });

  it('skips dangling parent references (parent not in chain)', () => {
    const child = makeAttestation('child-1', 50, [
      { attestation_id: 'missing-parent', quantity_consumed: 999 },
    ]);

    const anomalies = checkMassBalance([child]);
    expect(anomalies).toEqual([]);
  });
});
