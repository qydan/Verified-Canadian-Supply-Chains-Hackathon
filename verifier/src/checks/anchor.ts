import type { OfficialAttestation, Anomaly } from '../types.js';
import type { AnchorEntry } from '../registry.js';
import { contentHash } from '../canonical.js';

/**
 * Check attestations against the anchor registry.
 *
 * For each attestation whose attestation_id appears in the anchor registry:
 * - Content check: recompute content hash; if differs from anchored → anchor_mismatch
 * - Provenance check: if submitted under a different product_id than anchored → replay_cross_chain
 *
 * Attestations absent from the registry are NOT violations (the registry is not exhaustive).
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */
export function checkAnchors(
  attestations: OfficialAttestation[],
  anchors: Map<string, AnchorEntry>,
  productAttestationId: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const att of attestations) {
    // Look up attestation_id in the anchors map
    const anchor = anchors.get(att.attestation_id);

    // If not found → skip (absence is not a violation)
    if (!anchor) {
      continue;
    }

    // Recompute content hash
    const computed = contentHash(att as unknown as Record<string, unknown>);

    // Content check: if computed hash !== anchor.content_hash → anchor_mismatch
    if (computed !== anchor.content_hash) {
      anomalies.push({
        type: 'anchor_mismatch',
        attestation_id: att.attestation_id,
        details: `Content hash mismatch with anchor registry: expected ${anchor.content_hash}, got ${computed}`,
      });
    }

    // Provenance check: if request's productAttestationId !== anchor.product_id → replay_cross_chain
    if (productAttestationId !== anchor.product_id) {
      anomalies.push({
        type: 'replay_cross_chain',
        attestation_id: att.attestation_id,
        details: `Attestation anchored to product ${anchor.product_id} but submitted under product ${productAttestationId}`,
      });
    }
  }

  return anomalies;
}
