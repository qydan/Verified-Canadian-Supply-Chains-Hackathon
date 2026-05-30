import { describe, it, expect } from 'vitest';
import { buildDag } from './dag.js';
import type { OfficialAttestation } from './types.js';

/** Helper to create a minimal attestation for testing */
function makeAttestation(
  id: string,
  parents: Array<{ attestation_id: string }> = []
): OfficialAttestation {
  return {
    attestation_id: id,
    version: '1.0',
    supplier_id: 'sup-test',
    timestamp: '2026-01-01T00:00:00Z',
    action_type: 'raw_material_supply',
    performed_in_country: 'CA',
    parents: parents.map((p) => ({
      attestation_id: p.attestation_id,
      content_hash: 'abc123',
      quantity_consumed: 1,
      unit: 'kg',
    })),
    output: { name: 'Test Output', quantity_produced: 10, unit: 'kg' },
    costs: { material_cad: 100, labour_hours: 0, labour_cost_cad: 0 },
    signature: { algorithm: 'ed25519', value: 'dGVzdA==' },
  };
}

describe('buildDag', () => {
  describe('normal chain construction', () => {
    it('builds a simple linear chain (A → B → C)', () => {
      const attA = makeAttestation('att-a');
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);
      const attC = makeAttestation('att-c', [{ attestation_id: 'att-b' }]);

      const result = buildDag([attA, attB, attC], 'att-c');

      expect(result.nodes.size).toBe(3);
      expect(result.leaf).not.toBeNull();
      expect(result.leaf!.attestation.attestation_id).toBe('att-c');
      expect(result.anomalies).toHaveLength(0);

      // Check edges
      const nodeA = result.nodes.get('att-a')!;
      const nodeB = result.nodes.get('att-b')!;
      const nodeC = result.nodes.get('att-c')!;

      expect(nodeA.children).toContain(nodeB);
      expect(nodeB.parents).toContain(nodeA);
      expect(nodeB.children).toContain(nodeC);
      expect(nodeC.parents).toContain(nodeB);
    });

    it('builds a diamond-shaped DAG (A,B → C → D)', () => {
      const attA = makeAttestation('att-a');
      const attB = makeAttestation('att-b');
      const attC = makeAttestation('att-c', [
        { attestation_id: 'att-a' },
        { attestation_id: 'att-b' },
      ]);
      const attD = makeAttestation('att-d', [{ attestation_id: 'att-c' }]);

      const result = buildDag([attA, attB, attC, attD], 'att-d');

      expect(result.nodes.size).toBe(4);
      expect(result.anomalies).toHaveLength(0);

      const nodeC = result.nodes.get('att-c')!;
      expect(nodeC.parents).toHaveLength(2);
      expect(nodeC.parents.map((p) => p.attestation.attestation_id).sort()).toEqual([
        'att-a',
        'att-b',
      ]);
    });

    it('computes depth correctly via BFS from leaf', () => {
      const attA = makeAttestation('att-a');
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);
      const attC = makeAttestation('att-c', [{ attestation_id: 'att-b' }]);

      const result = buildDag([attA, attB, attC], 'att-c');

      expect(result.nodes.get('att-c')!.depth).toBe(0);
      expect(result.nodes.get('att-b')!.depth).toBe(1);
      expect(result.nodes.get('att-a')!.depth).toBe(2);
    });
  });

  describe('cycle detection', () => {
    it('detects a simple two-node cycle', () => {
      const attA = makeAttestation('att-a', [{ attestation_id: 'att-b' }]);
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);

      const result = buildDag([attA, attB], 'att-a');

      const cycleAnomalies = result.anomalies.filter(
        (a) => a.type === 'circular_reference'
      );
      expect(cycleAnomalies.length).toBeGreaterThanOrEqual(2);

      const cycleIds = cycleAnomalies.map((a) => a.attestation_id).sort();
      expect(cycleIds).toContain('att-a');
      expect(cycleIds).toContain('att-b');
    });

    it('detects a three-node cycle (A → B → C → A)', () => {
      const attA = makeAttestation('att-a', [{ attestation_id: 'att-c' }]);
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);
      const attC = makeAttestation('att-c', [{ attestation_id: 'att-b' }]);

      const result = buildDag([attA, attB, attC], 'att-a');

      const cycleAnomalies = result.anomalies.filter(
        (a) => a.type === 'circular_reference'
      );
      expect(cycleAnomalies.length).toBeGreaterThanOrEqual(3);

      const cycleIds = cycleAnomalies.map((a) => a.attestation_id).sort();
      expect(cycleIds).toContain('att-a');
      expect(cycleIds).toContain('att-b');
      expect(cycleIds).toContain('att-c');
    });

    it('does not report cycle for a valid DAG', () => {
      const attA = makeAttestation('att-a');
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);
      const attC = makeAttestation('att-c', [{ attestation_id: 'att-a' }]);

      const result = buildDag([attA, attB, attC], 'att-b');

      const cycleAnomalies = result.anomalies.filter(
        (a) => a.type === 'circular_reference'
      );
      expect(cycleAnomalies).toHaveLength(0);
    });
  });

  describe('dangling parent detection', () => {
    it('detects a dangling parent reference', () => {
      const attA = makeAttestation('att-a', [
        { attestation_id: 'att-missing' },
      ]);

      const result = buildDag([attA], 'att-a');

      const danglingAnomalies = result.anomalies.filter(
        (a) => a.type === 'dangling_parent'
      );
      expect(danglingAnomalies).toHaveLength(1);
      expect(danglingAnomalies[0].attestation_id).toBe('att-a');
      expect(danglingAnomalies[0].details).toContain('att-missing');
    });

    it('detects multiple dangling parents on the same attestation', () => {
      const attA = makeAttestation('att-a', [
        { attestation_id: 'att-missing-1' },
        { attestation_id: 'att-missing-2' },
      ]);

      const result = buildDag([attA], 'att-a');

      const danglingAnomalies = result.anomalies.filter(
        (a) => a.type === 'dangling_parent'
      );
      expect(danglingAnomalies).toHaveLength(2);
      expect(danglingAnomalies.every((a) => a.attestation_id === 'att-a')).toBe(
        true
      );
    });

    it('does not report dangling parent when all parents exist', () => {
      const attA = makeAttestation('att-a');
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);

      const result = buildDag([attA, attB], 'att-b');

      const danglingAnomalies = result.anomalies.filter(
        (a) => a.type === 'dangling_parent'
      );
      expect(danglingAnomalies).toHaveLength(0);
    });
  });

  describe('order independence', () => {
    it('produces the same DAG structure regardless of attestation order', () => {
      const attA = makeAttestation('att-a');
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);
      const attC = makeAttestation('att-c', [{ attestation_id: 'att-b' }]);

      // Try different orderings
      const orderings = [
        [attA, attB, attC],
        [attC, attB, attA],
        [attB, attA, attC],
        [attC, attA, attB],
        [attB, attC, attA],
        [attA, attC, attB],
      ];

      for (const ordering of orderings) {
        const result = buildDag(ordering, 'att-c');

        expect(result.nodes.size).toBe(3);
        expect(result.leaf!.attestation.attestation_id).toBe('att-c');
        expect(result.anomalies).toHaveLength(0);

        // Verify edges are the same
        const nodeA = result.nodes.get('att-a')!;
        const nodeB = result.nodes.get('att-b')!;
        const nodeC = result.nodes.get('att-c')!;

        expect(nodeA.parents).toHaveLength(0);
        expect(nodeA.children).toHaveLength(1);
        expect(nodeB.parents).toHaveLength(1);
        expect(nodeB.children).toHaveLength(1);
        expect(nodeC.parents).toHaveLength(1);
        expect(nodeC.children).toHaveLength(0);

        // Verify depths
        expect(nodeC.depth).toBe(0);
        expect(nodeB.depth).toBe(1);
        expect(nodeA.depth).toBe(2);
      }
    });
  });

  describe('single attestation (leaf only)', () => {
    it('handles a single attestation with no parents', () => {
      const attA = makeAttestation('att-a');

      const result = buildDag([attA], 'att-a');

      expect(result.nodes.size).toBe(1);
      expect(result.leaf).not.toBeNull();
      expect(result.leaf!.attestation.attestation_id).toBe('att-a');
      expect(result.leaf!.depth).toBe(0);
      expect(result.leaf!.parents).toHaveLength(0);
      expect(result.leaf!.children).toHaveLength(0);
      expect(result.anomalies).toHaveLength(0);
    });
  });

  describe('leaf identification', () => {
    it('returns null leaf when product_attestation_id is not in the chain', () => {
      const attA = makeAttestation('att-a');

      const result = buildDag([attA], 'att-nonexistent');

      expect(result.leaf).toBeNull();
      expect(result.nodes.size).toBe(1);
    });

    it('does not compute depth when leaf is null', () => {
      const attA = makeAttestation('att-a');
      const attB = makeAttestation('att-b', [{ attestation_id: 'att-a' }]);

      const result = buildDag([attA, attB], 'att-nonexistent');

      expect(result.leaf).toBeNull();
      expect(result.nodes.get('att-a')!.depth).toBe(-1);
      expect(result.nodes.get('att-b')!.depth).toBe(-1);
    });
  });
});
