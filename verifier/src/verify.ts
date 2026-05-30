import type { VerifyRequest, VerifyResponse, Anomaly } from './types.js';
import type { LoadedRegistries } from './registry.js';
import { buildDag } from './dag.js';
import { checkSignatures } from './checks/signature.js';
import { checkParentHashes } from './checks/hash.js';
import { checkMassBalance } from './checks/mass-balance.js';
import { checkUnits } from './checks/unit.js';
import { checkTimestamps } from './checks/timestamp.js';
import { checkAnchors } from './checks/anchor.js';
import { computeCanadianContent } from './compute/canadian-content.js';
import { determineDesignation } from './compute/designation.js';

/**
 * Main verification orchestrator.
 *
 * Runs the full pipeline:
 * 1. Build DAG (detects cycles, dangling parents)
 * 2. Verify signatures (per attestation)
 * 3. Verify parent hashes (per parent reference)
 * 4. Check mass balance (over-consumption)
 * 5. Check unit mismatches
 * 6. Check timestamp inversions
 * 7. Check anchor registry (content hash + cross-chain replay)
 * 8. Compute Canadian content percentage
 * 9. Determine designation
 * 10. Aggregate all anomalies
 * 11. Build response (chain_valid = anomalies.length === 0)
 *
 * All checks run independently — one failure does not short-circuit others.
 * Percentage and designation are always computed regardless of anomalies.
 *
 * Validates: Requirements 13.1, 13.2, 1.2
 */
export function verifyChain(
  request: VerifyRequest,
  registries: LoadedRegistries
): VerifyResponse {
  const { attestations, product_attestation_id } = request;

  // 1. Build DAG → collect structural anomalies (cycles, dangling parents)
  const dagResult = buildDag(attestations, product_attestation_id);
  const structuralAnomalies: Anomaly[] = dagResult.anomalies;

  // 2. Verify signatures
  const signatureAnomalies = checkSignatures(attestations, registries.suppliers);

  // 3. Verify parent hashes
  const hashAnomalies = checkParentHashes(attestations);

  // 4. Check mass balance
  const massBalanceAnomalies = checkMassBalance(attestations);

  // 5. Check unit mismatches
  const unitAnomalies = checkUnits(attestations);

  // 6. Check timestamp inversions
  const timestampAnomalies = checkTimestamps(attestations);

  // 7. Check anchor registry
  const anchorAnomalies = checkAnchors(
    attestations,
    registries.anchors,
    product_attestation_id
  );

  // 8. Compute Canadian content percentage
  const percentage = computeCanadianContent(attestations);

  // 9. Determine designation
  const designation = determineDesignation(
    attestations,
    product_attestation_id,
    percentage
  );

  // 10. Aggregate all anomalies
  const anomalies: Anomaly[] = [
    ...structuralAnomalies,
    ...signatureAnomalies,
    ...hashAnomalies,
    ...massBalanceAnomalies,
    ...unitAnomalies,
    ...timestampAnomalies,
    ...anchorAnomalies,
  ];

  // 11. Build response
  return {
    product_attestation_id,
    canadian_content_percentage: percentage,
    designation,
    chain_valid: anomalies.length === 0,
    anomalies,
  };
}
