import type { OfficialAttestation, Anomaly } from './types.js';

/** DAG node wrapping an attestation with graph metadata */
export interface DagNode {
  attestation: OfficialAttestation;
  children: DagNode[]; // nodes that consume this node's output
  parents: DagNode[]; // nodes this node consumes from
  depth: number; // hop distance from leaf (computed via BFS)
}

/** Result of DAG construction */
export interface DagResult {
  nodes: Map<string, DagNode>; // attestation_id → node
  leaf: DagNode | null; // product attestation node
  anomalies: Anomaly[]; // structural anomalies (cycles, dangling)
}

/**
 * Build a DAG from an unordered array of attestations.
 *
 * 1. Index all attestations by attestation_id
 * 2. Wire parent-child edges using parents[].attestation_id references
 * 3. Detect dangling parents (referenced ID not in the index)
 * 4. Detect cycles using iterative DFS with coloring (white/gray/black)
 * 5. Identify the leaf node from productAttestationId
 * 6. Compute depth (hop distance from leaf) via BFS
 */
export function buildDag(
  attestations: OfficialAttestation[],
  productAttestationId: string
): DagResult {
  const anomalies: Anomaly[] = [];
  const nodes = new Map<string, DagNode>();

  // Pass 1: Index all attestations by attestation_id
  for (const att of attestations) {
    nodes.set(att.attestation_id, {
      attestation: att,
      children: [],
      parents: [],
      depth: -1,
    });
  }

  // Pass 2: Wire parent-child edges and detect dangling parents
  for (const att of attestations) {
    const childNode = nodes.get(att.attestation_id)!;
    for (const parentRef of att.parents) {
      const parentNode = nodes.get(parentRef.attestation_id);
      if (!parentNode) {
        // Dangling parent: referenced attestation_id not in the submitted chain
        anomalies.push({
          type: 'dangling_parent',
          attestation_id: att.attestation_id,
          details: `Parent reference ${parentRef.attestation_id} not found in submitted attestations`,
        });
      } else {
        // Wire the edge: child consumes from parent
        childNode.parents.push(parentNode);
        parentNode.children.push(childNode);
      }
    }
  }

  // Pass 3: Detect cycles using iterative DFS with coloring
  const cycleNodes = detectCycles(nodes);
  for (const nodeId of cycleNodes) {
    anomalies.push({
      type: 'circular_reference',
      attestation_id: nodeId,
      details: `Attestation is involved in a cycle`,
    });
  }

  // Identify the leaf node
  const leaf = nodes.get(productAttestationId) ?? null;

  // Pass 4: Compute depth via BFS from the leaf
  if (leaf) {
    computeDepthBFS(leaf);
  }

  return { nodes, leaf, anomalies };
}

/**
 * Detect cycles using iterative DFS with coloring.
 * Colors: WHITE (0) = unvisited, GRAY (1) = in current path, BLACK (2) = fully processed
 *
 * Returns the set of attestation_ids that are part of cycles.
 */
function detectCycles(nodes: Map<string, DagNode>): Set<string> {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  for (const id of nodes.keys()) {
    color.set(id, WHITE);
  }

  const cycleNodes = new Set<string>();

  for (const startId of nodes.keys()) {
    if (color.get(startId) !== WHITE) continue;

    // Iterative DFS using an explicit stack
    // Stack entries: [nodeId, parentIndex] where parentIndex tracks which parent we're exploring next
    const stack: Array<[string, number]> = [[startId, 0]];
    color.set(startId, GRAY);

    while (stack.length > 0) {
      const [currentId, parentIdx] = stack[stack.length - 1];
      const currentNode = nodes.get(currentId)!;
      const parents = currentNode.parents;

      if (parentIdx < parents.length) {
        // Advance the parent index for the current frame
        stack[stack.length - 1] = [currentId, parentIdx + 1];

        const parentId = parents[parentIdx].attestation.attestation_id;
        const parentColor = color.get(parentId)!;

        if (parentColor === GRAY) {
          // Back edge found — cycle detected
          // Mark all nodes in the cycle (from the gray parent back to current position in stack)
          let foundCycleStart = false;
          for (const [stackId] of stack) {
            if (stackId === parentId) {
              foundCycleStart = true;
            }
            if (foundCycleStart) {
              cycleNodes.add(stackId);
            }
          }
        } else if (parentColor === WHITE) {
          // Explore this parent
          color.set(parentId, GRAY);
          stack.push([parentId, 0]);
        }
        // BLACK nodes are already fully processed, skip
      } else {
        // All parents explored, mark as BLACK
        stack.pop();
        color.set(currentId, BLACK);
      }
    }
  }

  return cycleNodes;
}

/**
 * Compute depth (hop distance from leaf) via BFS.
 * The leaf has depth 0, its parents have depth 1, etc.
 */
function computeDepthBFS(leaf: DagNode): void {
  const queue: DagNode[] = [leaf];
  leaf.depth = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const parent of current.parents) {
      if (parent.depth === -1) {
        parent.depth = current.depth + 1;
        queue.push(parent);
      }
    }
  }
}
