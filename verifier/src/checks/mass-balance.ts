import type { OfficialAttestation, Anomaly } from '../types.js';

/**
 * Check mass balance across the attestation chain.
 *
 * For each attestation P in the chain:
 *   total_consumed(P) = sum of quantity_consumed over EVERY parents[] entry
 *                       (across ALL attestations) that references P.attestation_id
 *   if total_consumed(P) > P.output.quantity_produced + epsilon:
 *       flag mass_balance_violation on P
 *
 * Key semantics (LOCKED):
 * - Over-consumption only (>). Under-consumption is legitimate and NOT flagged.
 * - The check is GLOBAL — sum ALL consumers of each node across the entire DAG.
 * - Attribute the anomaly to the PARENT P (the over-consumed node), not the child.
 * - Epsilon = 1e-6 for float-accumulation safety.
 *
 * Validates: Requirements 7.1, 7.2, 7.3
 */
export function checkMassBalance(
  attestations: OfficialAttestation[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const EPSILON = 1e-6;

  // Build lookup map: attestation_id → attestation
  const attMap = new Map<string, OfficialAttestation>();
  for (const att of attestations) {
    attMap.set(att.attestation_id, att);
  }

  // Accumulate total consumption per parent attestation_id
  // Key: parent attestation_id, Value: total quantity_consumed referencing it
  const totalConsumed = new Map<string, number>();

  for (const att of attestations) {
    for (const parentRef of att.parents) {
      const current = totalConsumed.get(parentRef.attestation_id) ?? 0;
      totalConsumed.set(parentRef.attestation_id, current + parentRef.quantity_consumed);
    }
  }

  // Check each attestation P: is it over-consumed?
  for (const [parentId, consumed] of totalConsumed) {
    const parentAtt = attMap.get(parentId);

    // Skip dangling parents (not in the submitted chain)
    if (!parentAtt) {
      continue;
    }

    const produced = parentAtt.output.quantity_produced;

    if (consumed > produced + EPSILON) {
      anomalies.push({
        type: 'mass_balance_violation',
        attestation_id: parentId,
        details: `Total consumed (${consumed}) exceeds quantity produced (${produced}) by ${(consumed - produced).toFixed(6)}`,
      });
    }
  }

  return anomalies;
}
