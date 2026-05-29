/**
 * Unified Anomaly Detector Facade
 *
 * Runs all 5 anomaly detection categories on attestations:
 * - Integrity violations (signature, content hash, supplier registry)
 * - Replay/reuse detection (cross-product input sharing)
 * - Quantity inconsistencies (consumed > produced)
 * - Structural problems (broken links, temporal ordering, cycles)
 * - Incomplete data (missing/invalid fields)
 *
 * Requirements: 2.4, 8.5
 */

import type Database from 'better-sqlite3';
import type { Attestation, Issue } from '../types.js';
import { checkIntegrity } from './integrity.js';
import { checkReplay } from './replay.js';
import { checkQuantity } from './quantity.js';
import { checkStructure } from './structure.js';
import { checkCompleteness } from './completeness.js';

/**
 * Builds a payload object from an attestation for completeness checking.
 */
function buildPayload(attestation: Attestation): Record<string, unknown> {
  return {
    productName: attestation.productName,
    productId: attestation.productId,
    supplierId: attestation.supplierId,
    location: attestation.location,
    materialCost: attestation.materialCost,
    labourCost: attestation.labourCost,
    outputQuantity: attestation.outputQuantity,
    outputUnit: attestation.outputUnit,
    timestamp: attestation.timestamp,
    isTransformation: attestation.isTransformation,
  };
}

/**
 * Runs all 5 anomaly detection categories on a single attestation.
 *
 * Executes all checks independently and aggregates all detected issues.
 *
 * @param attestation - The attestation to check
 * @param db - The database instance
 * @returns Array of all issues detected across all categories
 */
export function detectAll(attestation: Attestation, db: Database.Database): Issue[] {
  const issues: Issue[] = [];

  // 1. Integrity violations (signature, content hash, supplier registry)
  issues.push(...checkIntegrity(attestation, db));

  // 2. Replay/reuse detection
  issues.push(...checkReplay(attestation, db));

  // 3. Quantity inconsistencies
  issues.push(...checkQuantity(attestation, db));

  // 4. Structural problems (takes attestationId string, not attestation object)
  issues.push(...checkStructure(attestation.id, db));

  // 5. Incomplete data (takes payload, not attestation+db)
  const payload = buildPayload(attestation);
  const completenessIssues = checkCompleteness(payload);
  // Set the attestationId on completeness issues since checkCompleteness doesn't have it
  for (const issue of completenessIssues) {
    issue.attestationId = attestation.id;
  }
  issues.push(...completenessIssues);

  return issues;
}

/**
 * Runs all 5 anomaly detection categories on every attestation in a chain.
 *
 * @param chain - Array of attestations to check (typically from DAG traversal)
 * @param db - The database instance
 * @returns Array of all issues detected across all attestations and categories
 */
export function detectAllForChain(chain: Attestation[], db: Database.Database): Issue[] {
  const issues: Issue[] = [];

  for (const attestation of chain) {
    issues.push(...detectAll(attestation, db));
  }

  return issues;
}
