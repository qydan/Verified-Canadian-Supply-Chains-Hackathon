import { describe, it, expect, afterEach } from 'vitest';
import { initializeDatabase } from './database.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('initializeDatabase', () => {
  const testDbPaths: string[] = [];

  function createTestDbPath(): string {
    const dbPath = path.join(os.tmpdir(), `test-provenance-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    testDbPaths.push(dbPath);
    return dbPath;
  }

  afterEach(() => {
    for (const dbPath of testDbPaths) {
      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
        if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
      } catch {
        // ignore cleanup errors
      }
    }
    testDbPaths.length = 0;
  });

  it('should create the database file and return a Database instance', () => {
    const dbPath = createTestDbPath();
    const db = initializeDatabase(dbPath);
    expect(db).toBeDefined();
    expect(fs.existsSync(dbPath)).toBe(true);
    db.close();
  });

  it('should enable WAL journal mode', () => {
    const dbPath = createTestDbPath();
    const db = initializeDatabase(dbPath);
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe('wal');
    db.close();
  });

  it('should create the attestations table with correct columns', () => {
    const dbPath = createTestDbPath();
    const db = initializeDatabase(dbPath);
    const columns = db.prepare("PRAGMA table_info(attestations)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('content_hash');
    expect(columnNames).toContain('supplier_id');
    expect(columnNames).toContain('public_key');
    expect(columnNames).toContain('signature');
    expect(columnNames).toContain('timestamp');
    expect(columnNames).toContain('product_name');
    expect(columnNames).toContain('product_id');
    expect(columnNames).toContain('is_transformation');
    expect(columnNames).toContain('location');
    expect(columnNames).toContain('material_cost');
    expect(columnNames).toContain('labour_cost');
    expect(columnNames).toContain('currency');
    expect(columnNames).toContain('output_quantity');
    expect(columnNames).toContain('output_unit');
    expect(columnNames).toContain('payload_json');
    db.close();
  });

  it('should create the suppliers table with correct columns', () => {
    const dbPath = createTestDbPath();
    const db = initializeDatabase(dbPath);
    const columns = db.prepare("PRAGMA table_info(suppliers)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('public_key');
    expect(columnNames).toContain('location');
    expect(columnNames).toContain('registered_at');
    expect(columnNames).toContain('is_active');
    db.close();
  });

  it('should create the input_references table with correct columns', () => {
    const dbPath = createTestDbPath();
    const db = initializeDatabase(dbPath);
    const columns = db.prepare("PRAGMA table_info(input_references)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain('attestation_id');
    expect(columnNames).toContain('input_attestation_id');
    expect(columnNames).toContain('quantity_used');
    expect(columnNames).toContain('unit');
    db.close();
  });

  it('should create the issues table with correct columns', () => {
    const dbPath = createTestDbPath();
    const db = initializeDatabase(dbPath);
    const columns = db.prepare("PRAGMA table_info(issues)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('attestation_id');
    expect(columnNames).toContain('type');
    expect(columnNames).toContain('severity');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('details_json');
    db.close();
  });

  it('should create indexes on key columns', () => {
    const dbPath = createTestDbPath();
    const db = initializeDatabase(dbPath);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_attestations_content_hash');
    expect(indexNames).toContain('idx_attestations_product_id');
    expect(indexNames).toContain('idx_attestations_supplier_id');
    expect(indexNames).toContain('idx_attestations_public_key');
    expect(indexNames).toContain('idx_input_references_input_attestation_id');
    db.close();
  });

  it('should create the data directory if it does not exist', () => {
    const tmpDir = path.join(os.tmpdir(), `test-dir-${Date.now()}`);
    const dbPath = path.join(tmpDir, 'nested', 'provenance.db');
    testDbPaths.push(dbPath);
    const db = initializeDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
    db.close();
    // Cleanup directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should be idempotent - calling twice does not error', () => {
    const dbPath = createTestDbPath();
    const db1 = initializeDatabase(dbPath);
    db1.close();
    const db2 = initializeDatabase(dbPath);
    expect(db2).toBeDefined();
    db2.close();
  });
});
