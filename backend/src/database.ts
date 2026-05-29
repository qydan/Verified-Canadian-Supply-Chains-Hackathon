import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PATH = './data/provenance.db';

/**
 * Initializes the SQLite database with all required tables and indexes.
 * Creates the data directory if it doesn't exist.
 * Enables WAL mode for concurrent reads.
 *
 * @param dbPath - Path to the SQLite database file (default: ./data/provenance.db)
 * @returns The initialized Database instance
 */
export function initializeDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  // Ensure the directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for concurrent reads
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      public_key TEXT NOT NULL,
      location TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS attestations (
      id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      supplier_id TEXT,
      public_key TEXT NOT NULL,
      signature TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      product_name TEXT,
      product_id TEXT,
      is_transformation INTEGER,
      location TEXT,
      material_cost REAL,
      labour_cost REAL,
      currency TEXT,
      output_quantity REAL,
      output_unit TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS input_references (
      attestation_id TEXT NOT NULL,
      input_attestation_id TEXT NOT NULL,
      quantity_used REAL,
      unit TEXT,
      FOREIGN KEY (attestation_id) REFERENCES attestations(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      attestation_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      details_json TEXT,
      FOREIGN KEY (attestation_id) REFERENCES attestations(id)
    );
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attestations_content_hash ON attestations(content_hash);
    CREATE INDEX IF NOT EXISTS idx_attestations_product_id ON attestations(product_id);
    CREATE INDEX IF NOT EXISTS idx_attestations_supplier_id ON attestations(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_attestations_public_key ON attestations(public_key);
    CREATE INDEX IF NOT EXISTS idx_input_references_input_attestation_id ON input_references(input_attestation_id);
  `);

  return db;
}
