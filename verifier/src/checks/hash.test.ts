import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { checkParentHashes } from './hash.js';
import { contentHash } from '../canonical.js';
import type { OfficialAttestation } from '../types.js';

/**
 * Helper to create a minimal valid attestation for testing.
 */
function makeAttestation(overrides: Partial<OfficialAttestation> = {}): OfficialAttestation {
  return {
    attestation_id: 'att-child-001',
    version: '1.0',
    supplier_id: 'sup-test',
    timestamp: '2026-01-01T00:00:00Z',
    action_type: 'component_manufacture',
    performed_in_country: 'CA',
    parents: [],
    output: { name: 'Widget', quantity_produced: 10, unit: 'units' },
    costs: { material_cad: 100, labour_hours: 5, labour_cost_cad: 200 },
    signature: { algorithm: 'ed25519', value: 'dGVzdA==' },
    ...overrides,
  };
}

describe('checkParentHashes', () => {
  it('returns no anomalies for a valid chain with correct hashes', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
    });

    // Compute the correct content hash for the parent
    const correctHash = contentHash(parent as unknown as Record<string, unknown>);

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: correctHash,
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkParentHashes([parent, child]);
    expect(anomalies).toEqual([]);
  });

  it('detects a single parent hash mismatch', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'wrong_hash_value',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkParentHashes([parent, child]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('parent_hash_mismatch');
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].details).toContain('att-parent-001');
    expect(anomalies[0].details).toContain('wrong_hash_value');
  });

  it('detects multiple mismatches on the same child', () => {
    const parent1 = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
      output: { name: 'Part A', quantity_produced: 10, unit: 'units' },
    });

    const parent2 = makeAttestation({
      attestation_id: 'att-parent-002',
      parents: [],
      output: { name: 'Part B', quantity_produced: 20, unit: 'kg' },
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'bad_hash_1',
          quantity_consumed: 5,
          unit: 'units',
        },
        {
          attestation_id: 'att-parent-002',
          content_hash: 'bad_hash_2',
          quantity_consumed: 10,
          unit: 'kg',
        },
      ],
    });

    const anomalies = checkParentHashes([parent1, parent2, child]);
    expect(anomalies).toHaveLength(2);
    expect(anomalies[0].type).toBe('parent_hash_mismatch');
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    expect(anomalies[0].details).toContain('att-parent-001');
    expect(anomalies[1].type).toBe('parent_hash_mismatch');
    expect(anomalies[1].attestation_id).toBe('att-child-001');
    expect(anomalies[1].details).toContain('att-parent-002');
  });

  it('skips dangling parents (not in the submitted chain)', () => {
    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-nonexistent-parent',
          content_hash: 'some_hash',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    // Only the child is in the chain, parent is missing
    const anomalies = checkParentHashes([child]);
    expect(anomalies).toEqual([]);
  });

  it('uses the golden vector to verify correct hash computation', () => {
    // Load the worked example chain
    const chainPath = resolve(
      __dirname,
      '../../../provenance-hackathon-main/worked-example/recovery_drone_chain.json'
    );
    const chain = JSON.parse(readFileSync(chainPath, 'utf-8'));
    const attestations: OfficialAttestation[] = chain.attestations;

    // The worked example should have no parent hash mismatches
    const anomalies = checkParentHashes(attestations);
    expect(anomalies).toEqual([]);
  });

  it('reports anomaly on child, not on parent', () => {
    const parent = makeAttestation({
      attestation_id: 'att-parent-001',
      parents: [],
    });

    const child = makeAttestation({
      attestation_id: 'att-child-001',
      parents: [
        {
          attestation_id: 'att-parent-001',
          content_hash: 'incorrect_hash',
          quantity_consumed: 5,
          unit: 'units',
        },
      ],
    });

    const anomalies = checkParentHashes([parent, child]);
    expect(anomalies).toHaveLength(1);
    // The anomaly should be on the CHILD (the one with the bad reference)
    expect(anomalies[0].attestation_id).toBe('att-child-001');
    // NOT on the parent
    expect(anomalies[0].attestation_id).not.toBe('att-parent-001');
  });

  it('handles a chain with no parent references (root attestations only)', () => {
    const root1 = makeAttestation({
      attestation_id: 'att-root-001',
      parents: [],
    });
    const root2 = makeAttestation({
      attestation_id: 'att-root-002',
      parents: [],
    });

    const anomalies = checkParentHashes([root1, root2]);
    expect(anomalies).toEqual([]);
  });
});
