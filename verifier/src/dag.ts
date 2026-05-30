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
 * Detect cycles using Tarjan's SCC algorithm (iterative).
 * Only nodes in strongly connected components of size > 1 are true cycle members.
 *
 * Returns the set of attestation_ids that are part of cycles.
 */
function detectCycles(nodes: Map<string, DagNode>): Set<string> {
  const cycleNodes = new Set<string>();

  let index = 0;
  const nodeIndex = new Map<string, number>();
  const nodeLowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const sccStack: string[] = [];

  // Iterative Tarjan's using an explicit call stack
  // Each frame: [nodeId, parentIdx, isReturning]
  type Frame = { id: string; parentIdx: number };

  for (const startId of nodes.keys()) {
    if (nodeIndex.has(startId)) continue;

    const callStack: Frame[] = [{ id: startId, parentIdx: 0 }];
    nodeIndex.set(startId, index);
    nodeLowlink.set(startId, index);
    index++;
    onStack.add(startId);
    sccStack.push(startId);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      const currentNode = nodes.get(frame.id)!;
      const parents = currentNode.parents;

      if (frame.parentIdx < parents.length) {
        const parentId = parents[frame.parentIdx].attestation.attestation_id;
        frame.parentIdx++;

        if (!nodeIndex.has(parentId)) {
          // Not yet visited — recurse
          nodeIndex.set(parentId, index);
          nodeLowlink.set(parentId, index);
          index++;
          onStack.add(parentId);
          sccStack.push(parentId);
          callStack.push({ id: parentId, parentIdx: 0 });
        } else if (onStack.has(parentId)) {
          // Back edge to node on stack — update lowlink
          nodeLowlink.set(
            frame.id,
            Math.min(nodeLowlink.get(frame.id)!, nodeIndex.get(parentId)!)
          );
        }
      } else {
        // Done processing all parents — pop and propagate lowlink
        callStack.pop();

        if (callStack.length > 0) {
          const caller = callStack[callStack.length - 1];
          nodeLowlink.set(
            caller.id,
            Math.min(nodeLowlink.get(caller.id)!, nodeLowlink.get(frame.id)!)
          );
        }

        // If this is a root of an SCC, pop the SCC from the stack
        if (nodeLowlink.get(frame.id) === nodeIndex.get(frame.id)) {
          const scc: string[] = [];
          let w: string;
          do {
            w = sccStack.pop()!;
            onStack.delete(w);
            scc.push(w);
          } while (w !== frame.id);

          // Only SCCs with more than 1 node represent cycles
          if (scc.length > 1) {
            for (const nodeId of scc) {
              cycleNodes.add(nodeId);
            }
          }
        }
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
