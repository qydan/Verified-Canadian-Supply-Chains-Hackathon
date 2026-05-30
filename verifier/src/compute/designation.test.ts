import { describe, it, expect } from 'vitest';
import { determineDesignation } from './designation';
import { OfficialAttestation } from '../types';

/**
 * Helper to create a minimal attestation for testing.
 */
function makeAttestation(overrides: Partial<OfficialAttestation> & { attestation_id: string }): OfficialAttestation {
  return {
    attestation_id: overrides.attestation_id,
    version: '1.0',
    supplier_id: 'supplier-1',
    timestamp: '2024-01-01T00:00:00Z',
    action_type: overrides.action_type ?? 'raw_material_supply',
    performed_in_country: overrides.performed_in_country ?? 'CA',
    parents: overrides.parents ?? [],
    output: overrides.output ?? { name: 'widget', quantity_produced: 10, unit: 'kg' },
    costs: overrides.costs ?? { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
    signature: overrides.signature ?? { algorithm: 'ed25519', value: 'abc123' },
  };
}

describe('determineDesignation', () => {
  it('returns "made_in_canada" when leaf qualifies as ST in CA with percentage >= 51', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'final_integration',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
      parents: [{ attestation_id: 'parent1', content_hash: 'abc', quantity_consumed: 5, unit: 'kg' }],
    });
    const parent = makeAttestation({
      attestation_id: 'parent1',
      action_type: 'raw_material_supply',
      performed_in_country: 'US',
      costs: { material_cad: 50, labour_hours: 2, labour_cost_cad: 50 },
    });

    const result = determineDesignation([leaf, parent], 'leaf', 60);
    expect(result).toBe('made_in_canada');
  });

  it('returns "product_of_canada" when leaf qualifies as ST in CA with percentage >= 98', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'final_integration',
      performed_in_country: 'CA',
      costs: { material_cad: 900, labour_hours: 10, labour_cost_cad: 100 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 99);
    expect(result).toBe('product_of_canada');
  });

  it('returns "none" when last ST is not in CA', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'final_integration',
      performed_in_country: 'US',
      costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 75);
    expect(result).toBe('none');
  });

  it('returns "none" when no substantial transformation exists', () => {
    // raw_material_supply never qualifies as ST
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'raw_material_supply',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 10, labour_cost_cad: 200 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 80);
    expect(result).toBe('none');
  });

  it('returns "none" when ST is in CA but percentage < 51', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'final_integration',
      performed_in_country: 'CA',
      costs: { material_cad: 10, labour_hours: 5, labour_cost_cad: 20 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 30);
    expect(result).toBe('none');
  });

  it('raw_material_supply never qualifies as ST even with high labour_hours', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'raw_material_supply',
      performed_in_country: 'CA',
      costs: { material_cad: 500, labour_hours: 100, labour_cost_cad: 500 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 95);
    expect(result).toBe('none');
  });

  it('labour_hours < 4 does not qualify as ST', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'component_manufacture',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 3.9, labour_cost_cad: 200 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 80);
    expect(result).toBe('none');
  });

  it('returns "made_in_canada" at exactly 51% (inclusive threshold)', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'subassembly',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 4, labour_cost_cad: 200 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 51);
    expect(result).toBe('made_in_canada');
  });

  it('returns "product_of_canada" at exactly 98% (inclusive threshold)', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'subassembly',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 4, labour_cost_cad: 200 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 98);
    expect(result).toBe('product_of_canada');
  });

  it('returns "none" when percentage is 0 (zero total cost)', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'final_integration',
      performed_in_country: 'CA',
      costs: { material_cad: 0, labour_hours: 5, labour_cost_cad: 0 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 0);
    expect(result).toBe('none');
  });

  it('finds ST in parent when leaf does not qualify (BFS traversal)', () => {
    const parent = makeAttestation({
      attestation_id: 'parent1',
      action_type: 'component_manufacture',
      performed_in_country: 'CA',
      costs: { material_cad: 200, labour_hours: 8, labour_cost_cad: 400 },
      parents: [],
    });
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'raw_material_supply',
      performed_in_country: 'CA',
      costs: { material_cad: 50, labour_hours: 1, labour_cost_cad: 50 },
      parents: [{ attestation_id: 'parent1', content_hash: 'abc', quantity_consumed: 5, unit: 'kg' }],
    });

    const result = determineDesignation([leaf, parent], 'leaf', 70);
    expect(result).toBe('made_in_canada');
  });

  it('selects the closest ST to the leaf (fewest hops)', () => {
    // Chain: grandparent (ST, US) → parent (ST, CA) → leaf (not ST)
    const grandparent = makeAttestation({
      attestation_id: 'grandparent',
      action_type: 'component_manufacture',
      performed_in_country: 'US',
      costs: { material_cad: 100, labour_hours: 10, labour_cost_cad: 200 },
      parents: [],
    });
    const parent = makeAttestation({
      attestation_id: 'parent',
      action_type: 'subassembly',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 6, labour_cost_cad: 200 },
      parents: [{ attestation_id: 'grandparent', content_hash: 'abc', quantity_consumed: 5, unit: 'kg' }],
    });
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'raw_material_supply',
      performed_in_country: 'CA',
      costs: { material_cad: 10, labour_hours: 1, labour_cost_cad: 10 },
      parents: [{ attestation_id: 'parent', content_hash: 'def', quantity_consumed: 3, unit: 'kg' }],
    });

    // Parent is closer to leaf (1 hop) vs grandparent (2 hops)
    // Parent is in CA, so should be "made_in_canada"
    const result = determineDesignation([leaf, parent, grandparent], 'leaf', 65);
    expect(result).toBe('made_in_canada');
  });

  it('returns "none" when product_attestation_id not found in attestations', () => {
    const attestation = makeAttestation({
      attestation_id: 'some-id',
      action_type: 'final_integration',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
      parents: [],
    });

    const result = determineDesignation([attestation], 'nonexistent-id', 80);
    expect(result).toBe('none');
  });

  it('handles labour_hours exactly 4 as qualifying', () => {
    const leaf = makeAttestation({
      attestation_id: 'leaf',
      action_type: 'component_manufacture',
      performed_in_country: 'CA',
      costs: { material_cad: 100, labour_hours: 4, labour_cost_cad: 200 },
      parents: [],
    });

    const result = determineDesignation([leaf], 'leaf', 75);
    expect(result).toBe('made_in_canada');
  });
});
