/**
 * Anomaly Detection - Replay and Reuse
 *
 * Detects when the same attestation is reused across different product chains,
 * indicating fraudulent double-counting.
 *
 * - Flags REPLAY_DETECTED (CRITICAL) when same input attestation is referenced
 *   by attestations with different productIds
 * - Does NOT flag when multiple attestations with same productId reference same input
 * - Skips replay check if referenced input doesn't exist in database
 * - Includes sharedAttestationId, otherProductId, otherConsumerId in issue details
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import type Database from 'better-sqlite3';
import type { Attestation, Issue } from '../types.js';
import { IssueType, Severity } from '../types.js';

interface ConsumerRow {
  attestation_id: string;
  product_id: string;
}

/**
 * Checks for replay/reuse of input attestations across different product chains.
 */
export function checkReplay(attestation: Attestation, db: Database.Database): Issue[] {
  const issues: Issue[] = [];

  for (const inputRef of attestation.inputs) {
    // Requirement 9.4: Skip replay check if referenced input doesn't exist
    const inputExists = db
      .prepare('SELECT id FROM attestations WHERE id = ?')
      .get(inputRef.attestationId);

    if (!inputExists) {
      continue;
    }

    // Find all attestations that reference this same input
    const consumers = db
      .prepare(
        `SELECT ir.attestation_id, a.product_id
         FROM input_references ir
         JOIN attestations a ON a.id = ir.attestation_id
         WHERE ir.input_attestation_id = ?`
      )
      .all(inputRef.attestationId) as ConsumerRow[];

    // Filter to consumers in DIFFERENT product chains
    for (const consumer of consumers) {
      // Requirement 9.2: Do NOT flag when same productId references same input
      if (consumer.product_id === attestation.productId) {
        continue;
      }

      // Don't flag ourselves
      if (consumer.attestation_id === attestation.id) {
        continue;
      }

      // Requirement 9.1: Flag REPLAY_DETECTED for cross-product reuse
      issues.push({
        type: IssueType.REPLAY_DETECTED,
        severity: Severity.CRITICAL,
        attestationId: attestation.id,
        description: `Input attestation ${inputRef.attestationId} is also used in product ${consumer.product_id}`,
        details: {
          sharedAttestationId: inputRef.attestationId,
          otherProductId: consumer.product_id,
          otherConsumerId: consumer.attestation_id,
        },
      });
    }
  }

  return issues;
}
