import type Database from 'better-sqlite3';
import type { Attestation, InputReference, Issue } from '../types.js';
import { IssueType, Severity } from '../types.js';

const MAX_DEPTH = 100;

interface AttestationRow {
  id: string;
  content_hash: string;
  supplier_id: string;
  public_key: string;
  signature: string;
  timestamp: string;
  product_name: string;
  product_id: string;
  is_transformation: number;
  location: string;
  material_cost: number;
  labour_cost: number;
  currency: string;
  output_quantity: number;
  output_unit: string;
  payload_json: string;
}

interface InputReferenceRow {
  input_attestation_id: string;
  quantity_used: number;
  unit: string;
}

/**
 * Converts a database row into an Attestation object.
 */
function rowToAttestation(row: AttestationRow, inputs: InputReference[]): Attestation {
  return {
    id: row.id,
    contentHash: row.content_hash,
    supplierId: row.supplier_id,
    publicKey: row.public_key,
    signature: row.signature,
    timestamp: row.timestamp,
    productName: row.product_name,
    productId: row.product_id,
    isTransformation: row.is_transformation === 1,
    location: row.location,
    materialCost: row.material_cost,
    labourCost: row.labour_cost,
    currency: row.currency,
    inputs,
    outputQuantity: row.output_quantity,
    outputUnit: row.output_unit,
  };
}

/**
 * Loads an attestation from the database by ID, including its input references.
 */
function loadAttestation(id: string, db: Database.Database): Attestation | null {
  const row = db.prepare('SELECT * FROM attestations WHERE id = ?').get(id) as AttestationRow | undefined;
  if (!row) return null;

  const inputRows = db.prepare(
    'SELECT input_attestation_id, quantity_used, unit FROM input_references WHERE attestation_id = ?'
  ).all(id) as InputReferenceRow[];

  const inputs: InputReference[] = inputRows.map((r) => ({
    attestationId: r.input_attestation_id,
    quantityUsed: r.quantity_used,
    unit: r.unit,
  }));

  return rowToAttestation(row, inputs);
}

export interface WalkResult {
  attestations: Attestation[];
  issues: Issue[];
  error?: string;
}

/**
 * Detects cycles in the DAG by checking if adding an attestation with the given
 * inputs would create a cycle.
 *
 * Uses DFS with backtracking to detect if any path from the inputs leads back
 * to the currentId, which would form a cycle.
 *
 * @param inputs - The input references of the attestation being checked
 * @param currentId - The ID of the attestation being checked
 * @param db - The database instance
 * @returns true if a cycle is detected, false otherwise
 */
export function detectCycle(inputs: InputReference[], currentId: string, db: Database.Database): boolean {
  // Fast path: check for self-references
  for (const input of inputs) {
    if (input.attestationId === currentId) {
      return true;
    }
  }

  // DFS with backtracking to detect cycles
  const path = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (nodeId === currentId) {
      return true;
    }

    if (path.has(nodeId)) {
      // Already exploring this node in the current path, skip to avoid infinite loop
      return false;
    }

    path.add(nodeId);

    // Load input references for this node from the database
    const inputRows = db.prepare(
      'SELECT input_attestation_id, quantity_used, unit FROM input_references WHERE attestation_id = ?'
    ).all(nodeId) as InputReferenceRow[];

    for (const row of inputRows) {
      if (dfs(row.input_attestation_id)) {
        return true;
      }
    }

    path.delete(nodeId);
    return false;
  }

  // Start DFS from each input reference
  for (const input of inputs) {
    if (dfs(input.attestationId)) {
      return true;
    }
  }

  return false;
}

/**
 * Walks the ancestor chain of an attestation using BFS traversal.
 *
 * - Visits each attestation exactly once (tracked via visited set)
 * - Follows input references as DAG edges
 * - Returns error if starting attestation not found
 * - Caps traversal at 100 levels depth
 * - Returns all reachable ancestors plus the starting attestation
 * - Includes an INFO issue when the chain is truncated at 100 levels
 *
 * @param attestationId - The ID of the starting attestation
 * @param db - The database instance
 * @returns WalkResult containing the attestations found, issues, or an error
 */
export function walkAncestors(attestationId: string, db: Database.Database): WalkResult {
  const startAttestation = loadAttestation(attestationId, db);
  if (!startAttestation) {
    return { attestations: [], issues: [], error: `Attestation not found: ${attestationId}` };
  }

  const visited = new Set<string>();
  const result: Attestation[] = [];
  const issues: Issue[] = [];
  let truncated = false;

  // BFS queue entries: [attestation, depth]
  const queue: Array<[Attestation, number]> = [[startAttestation, 0]];
  visited.add(attestationId);

  while (queue.length > 0) {
    const [current, depth] = queue.shift()!;
    result.push(current);

    // Cap traversal at 100 levels depth
    if (depth >= MAX_DEPTH) {
      // Only flag truncation if there are unexplored children
      for (const input of current.inputs) {
        if (!visited.has(input.attestationId)) {
          const exists = db.prepare('SELECT id FROM attestations WHERE id = ?').get(input.attestationId);
          if (exists) {
            truncated = true;
            break;
          }
        }
      }
      continue;
    }

    // Follow input references as DAG edges
    for (const input of current.inputs) {
      if (visited.has(input.attestationId)) {
        continue;
      }
      visited.add(input.attestationId);

      const ancestor = loadAttestation(input.attestationId, db);
      if (ancestor) {
        queue.push([ancestor, depth + 1]);
      }
    }
  }

  if (truncated) {
    issues.push({
      type: IssueType.BROKEN_LINK,
      severity: Severity.INFO,
      attestationId,
      description: `Chain traversal truncated at ${MAX_DEPTH} levels`,
      details: { maxDepth: MAX_DEPTH, reason: 'DEPTH_LIMIT_REACHED' },
    });
  }

  return { attestations: result, issues };
}
