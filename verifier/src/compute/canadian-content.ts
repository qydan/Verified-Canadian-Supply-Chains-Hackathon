import { OfficialAttestation } from '../types.js';

/**
 * Compute Canadian content percentage using a flat sum over all attestations.
 *
 * Algorithm:
 *   total = Σ (material_cad + labour_cost_cad) for all attestations
 *   canadian_total = Σ (material_cad + labour_cost_cad) where performed_in_country == "CA"
 *   percentage = (canadian_total / total) * 100
 *
 * Attribution is by `performed_in_country` on each attestation (NOT supplier's registered_country).
 * `labour_hours` is NOT a cost and does NOT enter the percentage.
 * If total == 0, returns 0.
 */
export function computeCanadianContent(attestations: OfficialAttestation[]): number {
  let total = 0;
  let canadianTotal = 0;

  for (const attestation of attestations) {
    const nodeCost = attestation.costs.material_cad + attestation.costs.labour_cost_cad;
    total += nodeCost;
    if (attestation.performed_in_country === 'CA') {
      canadianTotal += nodeCost;
    }
  }

  if (total === 0) {
    return 0;
  }

  return (canadianTotal / total) * 100;
}
