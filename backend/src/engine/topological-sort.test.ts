import { describe, it, expect } from 'vitest';
import { topologicalSort } from './topological-sort.js';
import type { Attestation } from '../types.js';

/**
 * Helper to create a minimal attestation for testing.
 */
function makeAttestation(id: string, inputIds: string[] = []): Attestation {
  return {
    id,
    contentHash: `hash-${id}`,
    supplierId: 'supplier-1',
    publicKey: 'pk-1',
    signature: 'sig-1',
    timestamp: '2024-01-01T00:00:00Z',
    productName: `Product ${id}`,
    productId: 'product-1',
    isTransformation: false,
    location: 'CA',
    materialCost: 10,
    labourCost: 5,
    currency: 'CAD',
    inputs: inputIds.map((attestationId) => ({
      attestationId,
      quantityUsed: 1,
      unit: 'kg',
    })),
    outputQuantity: 1,
    outputUnit: 'kg',
  };
}

describe('topologicalSort', () => {
  it('returns empty array for empty input', () => {
    const result = topologicalSort([]);
    expect(result).toEqual([]);
  });

  it('returns single attestation unchanged', () => {
    const a = makeAttestation('A');
    const result = topologicalSort([a]);
    expect(result).toEqual([a]);
  });

  it('orders a simple linear chain (A -> B -> C)', () => {
    // C depends on B, B depends on A
    const a = makeAttestation('A');
    const b = makeAttestation('B', ['A']);
    const c = makeAttestation('C', ['B']);

    // Pass in any order
    const result = topologicalSort([c, a, b]);

    const ids = result.map((att) => att.id);
    // A must come before B, B must come before C
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
  });

  it('orders a diamond DAG correctly', () => {
    // A is raw material
    // B and C both depend on A
    // D depends on both B and C
    const a = makeAttestation('A');
    const b = makeAttestation('B', ['A']);
    const c = makeAttestation('C', ['A']);
    const d = makeAttestation('D', ['B', 'C']);

    const result = topologicalSort([d, c, b, a]);

    const ids = result.map((att) => att.id);
    // A must come before B and C
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
    // B and C must come before D
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
    expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));
  });

  it('handles multiple independent roots (raw materials)', () => {
    // A and B are independent raw materials
    // C depends on both A and B
    const a = makeAttestation('A');
    const b = makeAttestation('B');
    const c = makeAttestation('C', ['A', 'B']);

    const result = topologicalSort([c, b, a]);

    const ids = result.map((att) => att.id);
    // Both A and B must come before C
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
    // Result should contain all 3
    expect(result).toHaveLength(3);
  });

  it('ignores input references to attestations not in the provided set', () => {
    // B references A, but A is not in the provided set
    const b = makeAttestation('B', ['A']);
    const c = makeAttestation('C', ['B']);

    const result = topologicalSort([c, b]);

    const ids = result.map((att) => att.id);
    // B should come before C (B's reference to A is ignored since A isn't in the set)
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
    expect(result).toHaveLength(2);
  });

  it('handles a complex multi-level DAG', () => {
    // Raw materials: A, B
    // First processing: C depends on A, D depends on B
    // Assembly: E depends on C and D
    // Final: F depends on E
    const a = makeAttestation('A');
    const b = makeAttestation('B');
    const c = makeAttestation('C', ['A']);
    const d = makeAttestation('D', ['B']);
    const e = makeAttestation('E', ['C', 'D']);
    const f = makeAttestation('F', ['E']);

    const result = topologicalSort([f, e, d, c, b, a]);

    const ids = result.map((att) => att.id);
    // Verify all ordering constraints
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
    expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('E'));
    expect(ids.indexOf('D')).toBeLessThan(ids.indexOf('E'));
    expect(ids.indexOf('E')).toBeLessThan(ids.indexOf('F'));
    expect(result).toHaveLength(6);
  });

  it('preserves all attestations in the result', () => {
    const a = makeAttestation('A');
    const b = makeAttestation('B', ['A']);
    const c = makeAttestation('C', ['A']);

    const result = topologicalSort([a, b, c]);

    expect(result).toHaveLength(3);
    const ids = result.map((att) => att.id);
    expect(ids).toContain('A');
    expect(ids).toContain('B');
    expect(ids).toContain('C');
  });

  it('does not mutate the input array', () => {
    const a = makeAttestation('A');
    const b = makeAttestation('B', ['A']);
    const input = [b, a];
    const inputCopy = [...input];

    topologicalSort(input);

    expect(input).toEqual(inputCopy);
  });

  it('handles attestations with no inputs (all independent)', () => {
    const a = makeAttestation('A');
    const b = makeAttestation('B');
    const c = makeAttestation('C');

    const result = topologicalSort([a, b, c]);

    // All should be present, order doesn't matter since they're independent
    expect(result).toHaveLength(3);
    const ids = result.map((att) => att.id);
    expect(ids).toContain('A');
    expect(ids).toContain('B');
    expect(ids).toContain('C');
  });

  it('satisfies topological property: for every A referencing input B, B appears before A', () => {
    // Build a more complex graph and verify the property universally
    const a = makeAttestation('A');
    const b = makeAttestation('B');
    const c = makeAttestation('C', ['A', 'B']);
    const d = makeAttestation('D', ['A']);
    const e = makeAttestation('E', ['C', 'D']);

    const result = topologicalSort([e, d, c, b, a]);
    const ids = result.map((att) => att.id);
    const idSet = new Set(ids);

    // For every attestation in the result, check that all its inputs appear before it
    for (const att of result) {
      for (const inputRef of att.inputs) {
        if (idSet.has(inputRef.attestationId)) {
          expect(ids.indexOf(inputRef.attestationId)).toBeLessThan(ids.indexOf(att.id));
        }
      }
    }
  });
});
