import type { OfficialAttestation, Anomaly } from '../types.js';
import { contentHash } from '../canonical.js';

/**
 * Verify parent content hashes in an attestation chain.
 *
 * For each attestation, for each parent reference:
 * - Look up the parent attestation by attestation_id
 * - If parent not found (dangling), skip (handled by DAG builder)
 * - Recompute the parent's content hash
 * - Compare to the declared content_hash in the parent reference
 * - If mismatch → report parent_hash_mismatch on the CHILD
 *
 * Validates: Requirements 6.1, 6.2
 */
export function checkParentHashes(
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

      // Recompute the parent's content hash
      const computed = contentHash(parentAtt as unknown as Record<string, unknown>);

      // Compare to declared content_hash
      if (computed !== parentRef.content_hash) {
        anomalies.push({
          type: 'parent_hash_mismatch',
          attestation_id: att.attestation_id,
          details: `Parent ${parentRef.attestation_id} content hash mismatch: expected ${parentRef.content_hash}, got ${computed}`,
        });
      }
    }
  }

  return anomalies;
}
