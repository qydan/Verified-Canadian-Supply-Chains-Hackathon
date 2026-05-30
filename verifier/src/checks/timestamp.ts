import type { OfficialAttestation, Anomaly } from '../types.js';

/**
 * Detect timestamp inversions in an attestation chain.
 *
 * For each attestation (child), for each parent reference:
 * - Look up the parent attestation by attestation_id
 * - If parent not found (dangling), skip (handled by DAG builder)
 * - Compare parent's timestamp to child's timestamp
 * - If parent.timestamp > child.timestamp → report timestamp_inversion on the CHILD
 *
 * Since timestamps are ISO 8601 UTC with Z suffix (e.g., "2026-04-15T14:30:00Z"),
 * lexicographic string comparison works correctly for ordering.
 *
 * Validates: Requirements 9.1, 9.2
 */
export function checkTimestamps(
  attestations: OfficialAttestation[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Build lookup map: attestation_id → attestation
  const attMap = new Map<string, OfficialAttestation>();
  for (const att of attestations) {
    attMap.set(att.attestation_id, att);
  }

  // For each attestation, check each parent reference
  for (const att of attestations) {
    for (const parentRef of att.parents) {
      const parentAtt = attMap.get(parentRef.attestation_id);

      // Skip dangling parents (not in the submitted chain)
      if (!parentAtt) {
        continue;
      }

      // Compare timestamps: parent must not be strictly later than child
      if (parentAtt.timestamp > att.timestamp) {
        anomalies.push({
          type: 'timestamp_inversion',
          attestation_id: att.attestation_id,
          details: `Parent ${parentRef.attestation_id} timestamp (${parentAtt.timestamp}) is later than child timestamp (${att.timestamp})`,
        });
      }
    }
  }

  return anomalies;
}
