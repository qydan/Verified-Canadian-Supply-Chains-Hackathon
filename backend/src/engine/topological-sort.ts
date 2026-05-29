import type { Attestation } from '../types.js';

/**
 * Sorts attestations in topological order using Kahn's algorithm.
 *
 * Given a set of attestations (already collected by walkAncestors), returns them
 * ordered so that inputs come before consumers — raw materials first, final product last.
 *
 * For every attestation A that references input B (where B is in the provided set),
 * B will appear before A in the result.
 *
 * @param attestations - Array of attestations to sort (typically from walkAncestors)
 * @returns Attestations in topological order
 */
export function topologicalSort(attestations: Attestation[]): Attestation[] {
  if (attestations.length <= 1) {
    return [...attestations];
  }

  // Build a set of IDs in the provided attestation list for quick lookup
  const attestationIds = new Set(attestations.map((a) => a.id));

  // Build a map from ID to attestation for quick access
  const attestationMap = new Map<string, Attestation>();
  for (const att of attestations) {
    attestationMap.set(att.id, att);
  }

  // Build in-degree map: for each attestation, count how many of its inputs are in the set
  const inDegree = new Map<string, number>();
  // Build adjacency list: for each attestation that is referenced as input, track consumers
  const children = new Map<string, string[]>();

  for (const att of attestations) {
    if (!inDegree.has(att.id)) {
      inDegree.set(att.id, 0);
    }
    if (!children.has(att.id)) {
      children.set(att.id, []);
    }

    for (const inputRef of att.inputs) {
      // Only consider inputs that are within the provided set
      if (attestationIds.has(inputRef.attestationId)) {
        // att depends on inputRef.attestationId, so increment att's in-degree
        inDegree.set(att.id, (inDegree.get(att.id) ?? 0) + 1);
        // inputRef.attestationId has att as a consumer (child)
        if (!children.has(inputRef.attestationId)) {
          children.set(inputRef.attestationId, []);
        }
        children.get(inputRef.attestationId)!.push(att.id);
      }
    }
  }

  // Kahn's algorithm: start with all attestations that have in-degree 0 (raw materials)
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: Attestation[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    sorted.push(attestationMap.get(currentId)!);

    // Decrement in-degree of consumers
    for (const childId of children.get(currentId) ?? []) {
      const newDegree = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, newDegree);
      if (newDegree === 0) {
        queue.push(childId);
      }
    }
  }

  return sorted;
}
