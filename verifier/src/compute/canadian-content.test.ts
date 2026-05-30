import { describe, it, expect } from 'vitest';
import { computeCanadianContent } from './canadian-content.js';
import { OfficialAttestation } from '../types.js';

/** Helper to create a minimal attestation with costs and country */
function makeAttestation(
  overrides: Partial<OfficialAttestation> & Pick<OfficialAttestation, 'performed_in_country' | 'costs'>
): OfficialAttestation {
  return {
    attestation_id: 'att-test-' + Math.random().toString(36).slice(2, 8),
    version: '1.0',
    supplier_id: 'sup-test',
    timestamp: '2026-01-01T00:00:00Z',
    action_type: 'raw_material_supply',
    parents: [],
    output: { name: 'Test Output', quantity_produced: 1, unit: 'units' },
    signature: { algorithm: 'ed25519', value: '' },
    ...overrides,
  };
}

describe('computeCanadianContent', () => {
  it('computes percentage with mixed CA and non-CA attestations', () => {
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        performed_in_country: 'CA',
        costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
      }),
      makeAttestation({
        performed_in_country: 'US',
        costs: { material_cad: 150, labour_hours: 3, labour_cost_cad: 50 },
      }),
    ];

    // CA total = 100 + 200 = 300
    // Total = 300 + 150 + 50 = 500
    // Percentage = 300 / 500 * 100 = 60
    expect(computeCanadianContent(attestations)).toBeCloseTo(60, 5);
  });

  it('returns 100% when all attestations are CA', () => {
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        performed_in_country: 'CA',
        costs: { material_cad: 100, labour_hours: 2, labour_cost_cad: 50 },
      }),
      makeAttestation({
        performed_in_country: 'CA',
        costs: { material_cad: 200, labour_hours: 4, labour_cost_cad: 100 },
      }),
    ];

    expect(computeCanadianContent(attestations)).toBeCloseTo(100, 5);
  });

  it('returns 0% when no attestations are CA', () => {
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        performed_in_country: 'US',
        costs: { material_cad: 100, labour_hours: 2, labour_cost_cad: 50 },
      }),
      makeAttestation({
        performed_in_country: 'FR',
        costs: { material_cad: 200, labour_hours: 4, labour_cost_cad: 100 },
      }),
    ];

    expect(computeCanadianContent(attestations)).toBeCloseTo(0, 5);
  });

  it('returns 0 when total cost is zero', () => {
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        performed_in_country: 'CA',
        costs: { material_cad: 0, labour_hours: 10, labour_cost_cad: 0 },
      }),
      makeAttestation({
        performed_in_country: 'US',
        costs: { material_cad: 0, labour_hours: 5, labour_cost_cad: 0 },
      }),
    ];

    expect(computeCanadianContent(attestations)).toBe(0);
  });

  it('handles a single CA attestation', () => {
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        performed_in_country: 'CA',
        costs: { material_cad: 50, labour_hours: 3, labour_cost_cad: 75 },
      }),
    ];

    expect(computeCanadianContent(attestations)).toBeCloseTo(100, 5);
  });

  it('handles a single non-CA attestation', () => {
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        performed_in_country: 'US',
        costs: { material_cad: 50, labour_hours: 3, labour_cost_cad: 75 },
      }),
    ];

    expect(computeCanadianContent(attestations)).toBeCloseTo(0, 5);
  });

  it('produces ~58.4% for the worked example values', () => {
    // From the recovery drone worked example:
    // FR: 360 + 0 = 360
    // FR: 36 + 0 = 36
    // US: 2 + 0 = 2
    // US: 1.2 + 0 = 1.2
    // CA: 0 + 520 = 520 (component_manufacture)
    // US: 140 + 0 = 140
    // HK: 120 + 0 = 120
    // CN: 35 + 0 = 35
    // VN: 2 + 0 = 2
    // US: 1.8 + 0 = 1.8
    // CA: 60 + 0 = 60 (raw_material_supply, Nanuk case)
    // CA: 0 + 400 = 400 (final_integration)
    //
    // total = 360 + 36 + 2 + 1.2 + 520 + 140 + 120 + 35 + 2 + 1.8 + 60 + 400 = 1678
    // canadian_total = 520 + 60 + 400 = 980
    // percentage = 980 / 1678 * 100 ≈ 58.40%
    const attestations: OfficialAttestation[] = [
      makeAttestation({ performed_in_country: 'FR', costs: { material_cad: 360, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'FR', costs: { material_cad: 36, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'US', costs: { material_cad: 2, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'US', costs: { material_cad: 1.2, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'CA', costs: { material_cad: 0, labour_hours: 6.5, labour_cost_cad: 520 } }),
      makeAttestation({ performed_in_country: 'US', costs: { material_cad: 140, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'HK', costs: { material_cad: 120, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'CN', costs: { material_cad: 35, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'VN', costs: { material_cad: 2, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'US', costs: { material_cad: 1.8, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'CA', costs: { material_cad: 60, labour_hours: 0, labour_cost_cad: 0 } }),
      makeAttestation({ performed_in_country: 'CA', costs: { material_cad: 0, labour_hours: 5, labour_cost_cad: 400 } }),
    ];

    const result = computeCanadianContent(attestations);
    // Expected: 980 / 1678 * 100 ≈ 58.40
    expect(result).toBeCloseTo(58.4, 1);
  });

  it('uses performed_in_country for attribution, not supplier country', () => {
    // A supplier registered in US but performing work in CA should count as Canadian
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        supplier_id: 'sup-us-company',
        performed_in_country: 'CA',
        costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
      }),
      makeAttestation({
        supplier_id: 'sup-ca-company',
        performed_in_country: 'US',
        costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
      }),
    ];

    // Only the first attestation (performed_in_country: CA) counts
    // CA total = 300, Total = 600, Percentage = 50%
    expect(computeCanadianContent(attestations)).toBeCloseTo(50, 5);
  });

  it('does not include labour_hours in the cost calculation', () => {
    // labour_hours should NOT affect the percentage
    const attestations: OfficialAttestation[] = [
      makeAttestation({
        performed_in_country: 'CA',
        costs: { material_cad: 100, labour_hours: 1000, labour_cost_cad: 0 },
      }),
      makeAttestation({
        performed_in_country: 'US',
        costs: { material_cad: 100, labour_hours: 1, labour_cost_cad: 0 },
      }),
    ];

    // CA total = 100, Total = 200, Percentage = 50%
    // labour_hours (1000 vs 1) should have no effect
    expect(computeCanadianContent(attestations)).toBeCloseTo(50, 5);
  });
});
