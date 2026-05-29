/**
 * Anomaly Detection - Quantity Inconsistencies
 *
 * Detects when consumed quantities exceed what was produced upstream,
 * indicating impossible material claims.
 *
 * - Sums quantityUsed across ALL consumers of an upstream attestation (matching unit only)
 * - Flags QUANTITY_EXCEEDS_UPSTREAM (CRITICAL) when total consumed > upstream outputQuantity
 * - Flags QUANTITY_EXCEEDS_UPSTREAM (WARNING) when units don't match (case-sensitive)
 * - Skips check if upstream outputQuantity is null, zero, or negative
 * - Includes upstream attestation ID, produced quantity, total consumed, and unit in details
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import type Database from 'better-sqlite3';
import type { Attestation, Issue } from '../types.js';
import { IssueType, Severity } from '../types.js';

interface UpstreamRow {
  output_quantity: number | null;
  output_unit: string | null;
}

interface ConsumerRefRow {
  quantity_used: number;
  unit: string;
}

/**
 * Checks for quantity inconsistencies in an attestation's input references.
 */
export function checkQuantity(attestation: Attestation, db: Database.Database): Issue[] {
  const issues: Issue[] = [];

  for (const inputRef of attestation.inputs) {
    // Load the upstream attestation's output quantity and unit
    const upstream = db
      .prepare('SELECT output_quantity, output_unit FROM attestations WHERE id = ?')
      .get(inputRef.attestationId) as UpstreamRow | undefined;

    // Skip if upstream doesn't exist (handled by structural checks)
    if (!upstream) {
      continue;
    }

    // Requirement 10.4: Skip check if upstream outputQuantity is null, zero, or negative
    if (
      upstream.output_quantity === null ||
      upstream.output_quantity === undefined ||
      upstream.output_quantity <= 0
    ) {
      continue;
    }

    // Requirement 10.2: Check unit match (case-sensitive comparison)
    if (inputRef.unit !== upstream.output_unit) {
      issues.push({
        type: IssueType.QUANTITY_EXCEEDS_UPSTREAM,
        severity: Severity.WARNING,
        attestationId: attestation.id,
        description: `Unit mismatch: consuming "${inputRef.unit}" but upstream produces "${upstream.output_unit}"`,
        details: {
          inputAttestationId: inputRef.attestationId,
          consumerUnit: inputRef.unit,
          upstreamUnit: upstream.output_unit,
        },
      });
      continue;
    }

    // Requirement 10.5: Sum quantityUsed from ALL consumers of this upstream
    // that have matching units
    const consumerRefs = db
      .prepare(
        `SELECT quantity_used, unit FROM input_references
         WHERE input_attestation_id = ?`
      )
      .all(inputRef.attestationId) as ConsumerRefRow[];

    let totalConsumed = 0;
    for (const ref of consumerRefs) {
      // Only sum matching units (case-sensitive)
      if (ref.unit === upstream.output_unit) {
        totalConsumed += ref.quantity_used;
      }
    }

    // Requirement 10.1: Flag when total consumed exceeds upstream output
    if (totalConsumed > upstream.output_quantity) {
      issues.push({
        type: IssueType.QUANTITY_EXCEEDS_UPSTREAM,
        severity: Severity.CRITICAL,
        attestationId: attestation.id,
        description: `Total consumed (${totalConsumed} ${inputRef.unit}) exceeds produced (${upstream.output_quantity} ${upstream.output_unit})`,
        details: {
          inputAttestationId: inputRef.attestationId,
          produced: upstream.output_quantity,
          totalConsumed,
          unit: inputRef.unit,
        },
      });
    }
  }

  return issues;
}
