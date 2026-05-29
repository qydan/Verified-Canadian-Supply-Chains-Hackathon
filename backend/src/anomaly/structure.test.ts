import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkStructure } from './structure.js';
import { initializeDatabase } from '../database.js';
import { IssueType, Severity } from '../types.js';
import type Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('checkStructure', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-structure-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

  function insertAttestation(
    id: string,
    opts: {
      timestamp?: string;
      inputs?: Array<{ id: string; qty: number; unit: string }>;
    } = {}
  ) {
    const timestamp = opts.timestamp ?? '2024-01-15T00:00:00Z';
    db.prepare(`
      INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, `hash-${id}`, 'supplier-1', 'pubkey-1', 'sig-1', timestamp, `Product ${id}`, `product-${id}`, 0, 'CA', 100, 50, 'CAD', 10, 'kg', '{}');

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

  it('should return empty issues for attestation with no inputs', () => {
    insertAttestation('a1');
    const issues = checkStructure('a1', db);
    expect(issues).toHaveLength(0);
  });

  it('should return empty issues for non-existent attestation', () => {
    const issues = checkStructure('non-existent', db);
    expect(issues).toHaveLength(0);
  });

  it('should return empty issues for valid references with correct ordering', () => {
    insertAttestation('raw', { timestamp: '2024-01-01T00:00:00Z' });
    insertAttestation('final', {
      timestamp: '2024-01-15T00:00:00Z',
      inputs: [{ id: 'raw', qty: 5, unit: 'kg' }],
    });

    const issues = checkStructure('final', db);
    expect(issues).toHaveLength(0);
  });

  // Check 1: Broken links
  it('should detect broken links - input references to non-existent attestations', () => {
    insertAttestation('a1', {
      inputs: [{ id: 'non-existent-input', qty: 5, unit: 'kg' }],
    });

    const issues = checkStructure('a1', db);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe(IssueType.BROKEN_LINK);
    expect(issues[0].severity).toBe(Severity.CRITICAL);
    expect(issues[0].attestationId).toBe('a1');
    expect(issues[0].details?.missingAttestationId).toBe('non-existent-input');
  });

  it('should detect multiple broken links', () => {
    insertAttestation('a1', {
      inputs: [
        { id: 'missing-1', qty: 5, unit: 'kg' },
        { id: 'missing-2', qty: 3, unit: 'L' },
      ],
    });

    const issues = checkStructure('a1', db);
    const brokenLinks = issues.filter(i => i.type === IssueType.BROKEN_LINK);
    expect(brokenLinks).toHaveLength(2);
  });

  // Check 2: Impossible temporal ordering
  it('should detect impossible temporal ordering - input timestamp after attestation', () => {
    insertAttestation('input1', { timestamp: '2024-06-01T00:00:00Z' });
    insertAttestation('consumer', {
      timestamp: '2024-01-01T00:00:00Z',
      inputs: [{ id: 'input1', qty: 5, unit: 'kg' }],
    });

    const issues = checkStructure('consumer', db);
    const ordering = issues.filter(i => i.type === IssueType.IMPOSSIBLE_ORDERING);
    expect(ordering).toHaveLength(1);
    expect(ordering[0].severity).toBe(Severity.CRITICAL);
    expect(ordering[0].attestationId).toBe('consumer');
    expect(ordering[0].details?.inputAttestationId).toBe('input1');
    expect(ordering[0].details?.inputTimestamp).toBe('2024-06-01T00:00:00Z');
    expect(ordering[0].details?.attestationTimestamp).toBe('2024-01-01T00:00:00Z');
  });

  it('should not flag when input timestamp equals attestation timestamp', () => {
    insertAttestation('input1', { timestamp: '2024-01-15T00:00:00Z' });
    insertAttestation('consumer', {
      timestamp: '2024-01-15T00:00:00Z',
      inputs: [{ id: 'input1', qty: 5, unit: 'kg' }],
    });

    const issues = checkStructure('consumer', db);
    const ordering = issues.filter(i => i.type === IssueType.IMPOSSIBLE_ORDERING);
    expect(ordering).toHaveLength(0);
  });

  // Check 3: Self-reference
  it('should detect self-reference', () => {
    insertAttestation('self-ref', {
      inputs: [{ id: 'self-ref', qty: 5, unit: 'kg' }],
    });

    const issues = checkStructure('self-ref', db);
    const cycles = issues.filter(i => i.type === IssueType.CYCLE_DETECTED);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles[0].severity).toBe(Severity.CRITICAL);
    expect(cycles[0].attestationId).toBe('self-ref');
  });

  // Check 4: Broader cycle detection via DFS
  it('should detect broader cycle via DFS (A -> B -> C -> A)', () => {
    // Create a cycle: a -> b -> c -> a
    insertAttestation('a', { inputs: [{ id: 'b', qty: 5, unit: 'kg' }] });
    insertAttestation('b', { inputs: [{ id: 'c', qty: 5, unit: 'kg' }] });
    insertAttestation('c', { inputs: [{ id: 'a', qty: 5, unit: 'kg' }] });

    const issues = checkStructure('a', db);
    const cycles = issues.filter(i => i.type === IssueType.CYCLE_DETECTED);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles.some(c => c.description.includes('Cycle detected'))).toBe(true);
  });

  it('should detect direct cycle (A -> B -> A)', () => {
    insertAttestation('a', { inputs: [{ id: 'b', qty: 5, unit: 'kg' }] });
    insertAttestation('b', { inputs: [{ id: 'a', qty: 5, unit: 'kg' }] });

    const issues = checkStructure('a', db);
    const cycles = issues.filter(i => i.type === IssueType.CYCLE_DETECTED);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });

  it('should not report cycle for valid DAG (no cycles)', () => {
    insertAttestation('raw', { timestamp: '2024-01-01T00:00:00Z' });
    insertAttestation('mid', {
      timestamp: '2024-01-10T00:00:00Z',
      inputs: [{ id: 'raw', qty: 5, unit: 'kg' }],
    });
    insertAttestation('final', {
      timestamp: '2024-01-20T00:00:00Z',
      inputs: [{ id: 'mid', qty: 5, unit: 'kg' }],
    });

    const issues = checkStructure('final', db);
    const cycles = issues.filter(i => i.type === IssueType.CYCLE_DETECTED);
    expect(cycles).toHaveLength(0);
  });

  // Combined checks
  it('should report multiple issue types simultaneously', () => {
    // Create attestation with: one broken link, one impossible ordering
    insertAttestation('future-input', { timestamp: '2025-01-01T00:00:00Z' });
    insertAttestation('multi-issue', {
      timestamp: '2024-01-01T00:00:00Z',
      inputs: [
        { id: 'non-existent', qty: 5, unit: 'kg' },
        { id: 'future-input', qty: 3, unit: 'kg' },
      ],
    });

    const issues = checkStructure('multi-issue', db);
    const brokenLinks = issues.filter(i => i.type === IssueType.BROKEN_LINK);
    const ordering = issues.filter(i => i.type === IssueType.IMPOSSIBLE_ORDERING);
    expect(brokenLinks).toHaveLength(1);
    expect(ordering).toHaveLength(1);
  });

  it('should handle diamond dependencies without false cycle detection', () => {
    insertAttestation('raw', { timestamp: '2024-01-01T00:00:00Z' });
    insertAttestation('mid1', {
      timestamp: '2024-01-10T00:00:00Z',
      inputs: [{ id: 'raw', qty: 3, unit: 'kg' }],
    });
    insertAttestation('mid2', {
      timestamp: '2024-01-10T00:00:00Z',
      inputs: [{ id: 'raw', qty: 4, unit: 'kg' }],
    });
    insertAttestation('final', {
      timestamp: '2024-01-20T00:00:00Z',
      inputs: [
        { id: 'mid1', qty: 3, unit: 'kg' },
        { id: 'mid2', qty: 4, unit: 'kg' },
      ],
    });

    const issues = checkStructure('final', db);
    expect(issues).toHaveLength(0);
  });
});
