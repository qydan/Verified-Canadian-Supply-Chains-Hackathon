import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { walkAncestors, detectCycle } from './dag.js';
import { initializeDatabase } from '../database.js';
import type Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('walkAncestors', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-dag-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = initializeDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch {
      // ignore cleanup errors
    }
  });

  function insertAttestation(id: string, opts: { inputs?: Array<{ id: string; qty: number; unit: string }> } = {}) {
    db.prepare(`
      INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, `hash-${id}`, 'supplier-1', 'pubkey-1', 'sig-1', '2024-01-01T00:00:00Z', `Product ${id}`, `product-${id}`, 0, 'CA', 100, 50, 'CAD', 10, 'kg', '{}');

    if (opts.inputs) {
      const insertInput = db.prepare(`
        INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
        VALUES (?, ?, ?, ?)
      `);
      for (const input of opts.inputs) {
        insertInput.run(id, input.id, input.qty, input.unit);
      }
    }
  }

  it('should return error when starting attestation does not exist', () => {
    const result = walkAncestors('non-existent-id', db);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('non-existent-id');
    expect(result.attestations).toHaveLength(0);
  });

  it('should return the starting attestation when it has no inputs', () => {
    insertAttestation('a1');
    const result = walkAncestors('a1', db);
    expect(result.error).toBeUndefined();
    expect(result.attestations).toHaveLength(1);
    expect(result.attestations[0].id).toBe('a1');
  });

  it('should walk a simple linear chain', () => {
    insertAttestation('raw');
    insertAttestation('mid', { inputs: [{ id: 'raw', qty: 5, unit: 'kg' }] });
    insertAttestation('final', { inputs: [{ id: 'mid', qty: 5, unit: 'kg' }] });

    const result = walkAncestors('final', db);
    expect(result.error).toBeUndefined();
    expect(result.attestations).toHaveLength(3);
    const ids = result.attestations.map(a => a.id);
    expect(ids).toContain('final');
    expect(ids).toContain('mid');
    expect(ids).toContain('raw');
  });

  it('should visit each attestation exactly once even with diamond dependencies', () => {
    // Diamond: final -> [mid1, mid2] -> raw
    insertAttestation('raw');
    insertAttestation('mid1', { inputs: [{ id: 'raw', qty: 3, unit: 'kg' }] });
    insertAttestation('mid2', { inputs: [{ id: 'raw', qty: 4, unit: 'kg' }] });
    insertAttestation('final', { inputs: [{ id: 'mid1', qty: 3, unit: 'kg' }, { id: 'mid2', qty: 4, unit: 'kg' }] });

    const result = walkAncestors('final', db);
    expect(result.error).toBeUndefined();
    expect(result.attestations).toHaveLength(4);
    const ids = result.attestations.map(a => a.id);
    expect(new Set(ids).size).toBe(4); // all unique
    expect(ids).toContain('raw');
    expect(ids).toContain('mid1');
    expect(ids).toContain('mid2');
    expect(ids).toContain('final');
  });

  it('should handle broken links gracefully (input reference to non-existent attestation)', () => {
    insertAttestation('a1', { inputs: [{ id: 'non-existent', qty: 1, unit: 'kg' }] });

    const result = walkAncestors('a1', db);
    expect(result.error).toBeUndefined();
    expect(result.attestations).toHaveLength(1);
    expect(result.attestations[0].id).toBe('a1');
  });

  it('should cap traversal at 100 levels depth', () => {
    // Create a chain of 105 attestations
    const ids: string[] = [];
    for (let i = 0; i < 105; i++) {
      const id = `att-${i}`;
      ids.push(id);
      if (i === 0) {
        insertAttestation(id);
      } else {
        insertAttestation(id, { inputs: [{ id: ids[i - 1], qty: 1, unit: 'kg' }] });
      }
    }

    // Walk from the last attestation (depth 104)
    const result = walkAncestors(ids[104], db);
    expect(result.error).toBeUndefined();
    // Should have at most 101 attestations (depth 0 through 100)
    expect(result.attestations.length).toBeLessThanOrEqual(101);
    // The starting attestation should be included
    expect(result.attestations[0].id).toBe(ids[104]);
  });

  it('should correctly load input references for each attestation', () => {
    insertAttestation('raw1');
    insertAttestation('raw2');
    insertAttestation('final', { inputs: [{ id: 'raw1', qty: 5, unit: 'kg' }, { id: 'raw2', qty: 3, unit: 'L' }] });

    const result = walkAncestors('final', db);
    expect(result.error).toBeUndefined();
    const finalAtt = result.attestations.find(a => a.id === 'final');
    expect(finalAtt).toBeDefined();
    expect(finalAtt!.inputs).toHaveLength(2);
    expect(finalAtt!.inputs[0].attestationId).toBe('raw1');
    expect(finalAtt!.inputs[0].quantityUsed).toBe(5);
    expect(finalAtt!.inputs[1].attestationId).toBe('raw2');
    expect(finalAtt!.inputs[1].quantityUsed).toBe(3);
  });
});

describe('detectCycle', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-cycle-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = initializeDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch {
      // ignore cleanup errors
    }
  });

  function insertAttestation(id: string, opts: { inputs?: Array<{ id: string; qty: number; unit: string }> } = {}) {
    db.prepare(`
      INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, `hash-${id}`, 'supplier-1', 'pubkey-1', 'sig-1', '2024-01-01T00:00:00Z', `Product ${id}`, `product-${id}`, 0, 'CA', 100, 50, 'CAD', 10, 'kg', '{}');

    if (opts.inputs) {
      const insertInput = db.prepare(`
        INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
        VALUES (?, ?, ?, ?)
      `);
      for (const input of opts.inputs) {
        insertInput.run(id, input.id, input.qty, input.unit);
      }
    }
  }

  it('should detect self-reference (fast path)', () => {
    const inputs = [{ attestationId: 'a1', quantityUsed: 5, unit: 'kg' }];
    expect(detectCycle(inputs, 'a1', db)).toBe(true);
  });

  it('should return false when there are no inputs', () => {
    expect(detectCycle([], 'a1', db)).toBe(false);
  });

  it('should return false for a valid DAG with no cycles', () => {
    insertAttestation('raw');
    insertAttestation('mid', { inputs: [{ id: 'raw', qty: 5, unit: 'kg' }] });

    // Check if adding 'final' with input 'mid' would create a cycle
    const inputs = [{ attestationId: 'mid', quantityUsed: 5, unit: 'kg' }];
    expect(detectCycle(inputs, 'final', db)).toBe(false);
  });

  it('should detect a direct cycle (A -> B -> A)', () => {
    // B references A as input
    insertAttestation('a', { inputs: [{ id: 'b', qty: 5, unit: 'kg' }] });
    insertAttestation('b', { inputs: [{ id: 'a', qty: 5, unit: 'kg' }] });

    // Check if 'a' with input 'b' creates a cycle
    const inputs = [{ attestationId: 'b', quantityUsed: 5, unit: 'kg' }];
    expect(detectCycle(inputs, 'a', db)).toBe(true);
  });

  it('should detect an indirect cycle (A -> B -> C -> A)', () => {
    insertAttestation('b', { inputs: [{ id: 'c', qty: 5, unit: 'kg' }] });
    insertAttestation('c', { inputs: [{ id: 'a', qty: 5, unit: 'kg' }] });

    // Check if 'a' with input 'b' creates a cycle (a -> b -> c -> a)
    const inputs = [{ attestationId: 'b', quantityUsed: 5, unit: 'kg' }];
    expect(detectCycle(inputs, 'a', db)).toBe(true);
  });

  it('should return false when input references non-existent attestation', () => {
    // 'non-existent' is not in the database, so DFS can't follow it further
    const inputs = [{ attestationId: 'non-existent', quantityUsed: 5, unit: 'kg' }];
    expect(detectCycle(inputs, 'a1', db)).toBe(false);
  });

  it('should handle diamond dependencies without false positive', () => {
    // Diamond: final -> [mid1, mid2] -> raw (no cycle)
    insertAttestation('raw');
    insertAttestation('mid1', { inputs: [{ id: 'raw', qty: 3, unit: 'kg' }] });
    insertAttestation('mid2', { inputs: [{ id: 'raw', qty: 4, unit: 'kg' }] });

    const inputs = [
      { attestationId: 'mid1', quantityUsed: 3, unit: 'kg' },
      { attestationId: 'mid2', quantityUsed: 4, unit: 'kg' },
    ];
    expect(detectCycle(inputs, 'final', db)).toBe(false);
  });

  it('should detect cycle through multiple input references', () => {
    // a -> [b, c], c -> a (cycle through second input)
    insertAttestation('b');
    insertAttestation('c', { inputs: [{ id: 'a', qty: 2, unit: 'kg' }] });

    const inputs = [
      { attestationId: 'b', quantityUsed: 3, unit: 'kg' },
      { attestationId: 'c', quantityUsed: 2, unit: 'kg' },
    ];
    expect(detectCycle(inputs, 'a', db)).toBe(true);
  });
});
