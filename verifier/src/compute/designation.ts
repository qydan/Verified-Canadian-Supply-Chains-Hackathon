import { OfficialAttestation } from '../types';

/**
 * Action types that can qualify as a substantial transformation.
 */
const ST_ACTION_TYPES: Set<string> = new Set([
  'component_manufacture',
  'subassembly',
  'final_integration',
]);

/**
 * Minimum labour hours required for a node to qualify as a substantial transformation.
 */
const MIN_LABOUR_HOURS = 4;

/**
 * Determines whether an attestation qualifies as a substantial transformation.
 * A node qualifies iff:
 *   action_type ∈ {component_manufacture, subassembly, final_integration}
 *   AND costs.labour_hours >= 4
 */
function isSubstantialTransformation(attestation: OfficialAttestation): boolean {
  return (
    ST_ACTION_TYPES.has(attestation.action_type) &&
    attestation.costs.labour_hours >= MIN_LABOUR_HOURS
  );
}

/**
 * Finds the last substantial transformation by BFS from the leaf (product attestation)
 * through parents. "Last" means closest to the leaf (fewest hops).
 *
 * Returns the qualifying attestation, or null if none exists.
 */
function findLastSubstantialTransformation(
  attestations: OfficialAttestation[],
  productAttestationId: string
): OfficialAttestation | null {
  // Build a lookup map: attestation_id → attestation
  const attestationMap = new Map<string, OfficialAttestation>();
  for (const a of attestations) {
    attestationMap.set(a.attestation_id, a);
  }

  // Find the leaf (product attestation)
  const leaf = attestationMap.get(productAttestationId);
  if (!leaf) {
    return null;
  }

  // Check if the leaf itself qualifies
  if (isSubstantialTransformation(leaf)) {
    return leaf;
  }

  // BFS from the leaf through parents to find the closest qualifying node
  const visited = new Set<string>();
  const queue: OfficialAttestation[] = [];

  // Seed the queue with the leaf's parents
  visited.add(leaf.attestation_id);
  for (const parentRef of leaf.parents) {
    const parent = attestationMap.get(parentRef.attestation_id);
    if (parent && !visited.has(parent.attestation_id)) {
      visited.add(parent.attestation_id);
      queue.push(parent);
    }
  }

  // BFS level by level
  while (queue.length > 0) {
    const current = queue.shift()!;

    if (isSubstantialTransformation(current)) {
      return current;
    }

    // Add current node's parents to the queue
    for (const parentRef of current.parents) {
      const parent = attestationMap.get(parentRef.attestation_id);
      if (parent && !visited.has(parent.attestation_id)) {
        visited.add(parent.attestation_id);
        queue.push(parent);
      }
    }
  }

  return null;
}

/**
 * Determines the product designation based on:
 * 1. Finding the last substantial transformation (closest to leaf via BFS)
 * 2. Applying threshold rules based on percentage and country
 *
 * Rules:
 * - No ST exists → "none"
 * - Last ST not in CA → "none"
 * - Last ST in CA, percentage >= 98 → "product_of_canada"
 * - Last ST in CA, percentage >= 51 → "made_in_canada"
 * - Last ST in CA, percentage < 51 → "none"
 */
export function determineDesignation(
  attestations: OfficialAttestation[],
  productAttestationId: string,
  percentage: number
): 'product_of_canada' | 'made_in_canada' | 'none' {
  // If percentage is 0 (total cost was zero), designation is "none"
  if (percentage === 0) {
    return 'none';
  }

  const lastST = findLastSubstantialTransformation(attestations, productAttestationId);

  // No substantial transformation exists
  if (!lastST) {
    return 'none';
  }

  // Last ST not performed in Canada
  if (lastST.performed_in_country !== 'CA') {
    return 'none';
  }

  // Apply percentage thresholds (inclusive)
  if (percentage >= 98) {
    return 'product_of_canada';
  }

  if (percentage >= 51) {
    return 'made_in_canada';
  }

  return 'none';
}
