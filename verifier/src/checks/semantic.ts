import type { OfficialAttestation, Anomaly } from '../types.js';

/**
 * Semantic/heuristic anomaly checks that go beyond the core spec.
 *
 * These detect attacks that are structurally valid but semantically implausible:
 * 1. replay_within_chain: duplicate attestation_id in the same submission
 * 2. cost_anomaly: labour rate far outside the normal band (40-150 CAD/hr)
 * 3. transformation_implausible: non-raw-material step with zero parents
 */

/** Normal labour rate band (CAD/hr). Derived from training corpus clean chains. */
const LABOUR_RATE_MAX = 200; // clean chains max at ~142; 200 gives margin

/**
 * Action types that MUST have parents (they transform inputs into outputs).
 * raw_material_supply is the only type that legitimately has no parents.
 */
const REQUIRES_PARENTS: Set<string> = new Set([
  'component_manufacture',
  'subassembly',
  'final_integration',
]);

/**
 * Check for duplicate attestation_ids within the same submission.
 * A legitimate chain should never contain the same attestation_id twice.
 */
export function checkDuplicateIds(attestations: OfficialAttestation[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const seen = new Map<string, number>(); // attestation_id → count

  for (const att of attestations) {
    const count = (seen.get(att.attestation_id) ?? 0) + 1;
    seen.set(att.attestation_id, count);
  }

  for (const [id, count] of seen) {
    if (count > 1) {
      anomalies.push({
        type: 'replay_within_chain',
        attestation_id: id,
        details: `duplicate attestation_id in submission`,
      });
    }
  }

  return anomalies;
}

/**
 * Check for implausible labour rates.
 * Normal rates in the training corpus are 40-142 CAD/hr.
 * A rate of 1000 CAD/hr is clearly anomalous.
 */
export function checkCostAnomalies(attestations: OfficialAttestation[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const att of attestations) {
    const { labour_hours, labour_cost_cad } = att.costs;

    if (labour_hours > 0) {
      const rate = labour_cost_cad / labour_hours;

      if (rate > LABOUR_RATE_MAX) {
        anomalies.push({
          type: 'cost_anomaly',
          attestation_id: att.attestation_id,
          details: `labour rate ${rate.toFixed(1)} CAD/hr outside band`,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Check for transformation steps that consume nothing.
 * component_manufacture, subassembly, and final_integration must have parents
 * (they transform inputs). Only raw_material_supply can have empty parents.
 */
export function checkTransformationPlausibility(attestations: OfficialAttestation[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const att of attestations) {
    if (REQUIRES_PARENTS.has(att.action_type) && att.parents.length === 0) {
      anomalies.push({
        type: 'transformation_implausible',
        attestation_id: att.attestation_id,
        details: `${att.action_type} consumes nothing`,
      });
    }
  }

  return anomalies;
}
