/**
 * Anomaly Detection - Structural Problems
 *
 * Detects structural issues in the supply chain graph:
 * - Broken links: input references to non-existent attestations (BROKEN_LINK, CRITICAL)
 * - Impossible temporal ordering: input timestamp > attestation timestamp (IMPOSSIBLE_ORDERING, CRITICAL)
 * - Self-reference: attestation references itself (CYCLE_DETECTED, CRITICAL)
 * - Broader cycle detection via DFS with backtracking (CYCLE_DETECTED, CRITICAL)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import type Database from 'better-sqlite3';
import type { Issue } from '../types.js';
import { IssueType, Severity } from '../types.js';

interface AttestationTimestampRow {
  id: string;
  timestamp: string;
}

interface InputReferenceRow {
  input_attestation_id: string;
  quantity_used: number;
  unit: string;
}

/**
 * Checks for structural problems in an attestation's references.
 *
 * @param attestationId - The ID of the attestation to check
 * @param db - The database instance
 * @returns Array of structural issues found
 */
export function checkStructure(attestationId: string, db: Database.Database): Issue[] {
  const issues: Issue[] = [];

  // Load the attestation's timestamp and input references
  const attestation = db
    .prepare('SELECT id, timestamp FROM attestations WHERE id = ?')
    .get(attestationId) as AttestationTimestampRow | undefined;

  if (!attestation) {
    return issues;
  }

  const inputRefs = db
    .prepare('SELECT input_attestation_id, quantity_used, unit FROM input_references WHERE attestation_id = ?')
    .all(attestationId) as InputReferenceRow[];

  for (const inputRef of inputRefs) {
    // Check 3: Self-reference
    if (inputRef.input_attestation_id === attestationId) {
      issues.push({
        type: IssueType.CYCLE_DETECTED,
        severity: Severity.CRITICAL,
        attestationId,
        description: 'Attestation references itself as input',
        details: { selfReferenceId: attestationId },
      });
      continue;
    }

    // Check 1: Broken links - input references to non-existent attestations
    const referenced = db
      .prepare('SELECT id, timestamp FROM attestations WHERE id = ?')
      .get(inputRef.input_attestation_id) as AttestationTimestampRow | undefined;

    if (!referenced) {
      issues.push({
        type: IssueType.BROKEN_LINK,
        severity: Severity.CRITICAL,
        attestationId,
        description: `Referenced input ${inputRef.input_attestation_id} does not exist`,
        details: { missingAttestationId: inputRef.input_attestation_id },
      });
      continue;
    }

    // Check 2: Impossible temporal ordering - input timestamp > attestation timestamp
    if (referenced.timestamp > attestation.timestamp) {
      issues.push({
        type: IssueType.IMPOSSIBLE_ORDERING,
        severity: Severity.CRITICAL,
        attestationId,
        description: `Input ${inputRef.input_attestation_id} has timestamp AFTER this attestation`,
        details: {
          inputAttestationId: inputRef.input_attestation_id,
          inputTimestamp: referenced.timestamp,
          attestationTimestamp: attestation.timestamp,
        },
      });
    }
  }

  // Check 4: Broader cycle detection via DFS with backtracking
  if (inputRefs.length > 0 && hasCycleFrom(attestationId, attestationId, new Set(), db)) {
    issues.push({
      type: IssueType.CYCLE_DETECTED,
      severity: Severity.CRITICAL,
      attestationId,
      description: 'Cycle detected in supply chain graph',
    });
  }

  return issues;
}

/**
 * DFS with backtracking to detect if any path from nodeId leads back to targetId.
 */
function hasCycleFrom(
  targetId: string,
  nodeId: string,
  visited: Set<string>,
  db: Database.Database
): boolean {
  // Load input references for this node
  const inputRefs = db
    .prepare('SELECT input_attestation_id FROM input_references WHERE attestation_id = ?')
    .all(nodeId) as Array<{ input_attestation_id: string }>;

  for (const ref of inputRefs) {
    // Skip self-references (already handled above)
    if (nodeId === targetId && ref.input_attestation_id === targetId) {
      continue;
    }

    if (ref.input_attestation_id === targetId) {
      return true;
    }

    if (visited.has(ref.input_attestation_id)) {
      continue;
    }

    visited.add(ref.input_attestation_id);

    if (hasCycleFrom(targetId, ref.input_attestation_id, visited, db)) {
      return true;
    }

    visited.delete(ref.input_attestation_id);
  }

  return false;
}
