import type { OfficialAttestation, Anomaly } from '../types.js';

/**
 * Check for unit mismatches between parent references and parent outputs.
 *
 * For each attestation, for each parent reference:
 * - Look up the parent attestation by attestation_id
 * - If parent not found (dangling), skip (handled by DAG builder)
 * - Compare the parent reference's unit to the parent's output.unit
 * - If different → report unit_mismatch on the CHILD
 *
 * Comparison is case-sensitive (e.g., "kg" !== "Kg").
 *
 * Validates: Requirements 8.1, 8.2
 */
export function checkUnits(attestations: OfficialAttestation[]): Anomaly[] {
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

      // Compare parent reference unit to parent's output unit (case-sensitive)
      if (parentRef.unit !== parentAtt.output.unit) {
        anomalies.push({
          type: 'unit_mismatch',
          attestation_id: att.attestation_id,
          details: `Parent ${parentRef.attestation_id} unit mismatch: reference uses "${parentRef.unit}" but parent produces "${parentAtt.output.unit}"`,
        });
      }
    }
  }

  return anomalies;
}
