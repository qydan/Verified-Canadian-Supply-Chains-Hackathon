import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeCanadianContent, determineDesignation } from './canadian-content.js';
import { initializeDatabase } from '../database.js';
import { Designation, Severity, IssueType } from '../types.js';
import type Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('computeCanadianContent', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-cc-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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
      location?: string;
      materialCost?: number;
      labourCost?: number;
      isTransformation?: boolean;
      inputs?: Array<{ id: string; qty: number; unit: string }>;
    } = {}
  ) {
    const {
      location = 'CA',
      materialCost = 100,
      labourCost = 50,
      isTransformation = false,
      inputs = [],
    } = opts;

    db.prepare(`
      INSERT INTO attestations (id, content_hash, supplier_id, public_key, signature, timestamp, product_name, product_id, is_transformation, location, material_cost, labour_cost, currency, output_quantity, output_unit, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, `hash-${id}`, 'supplier-1', 'pubkey-1', 'sig-1', '2024-01-01T00:00:00Z',
      `Product ${id}`, `product-${id}`, isTransformation ? 1 : 0, location,
      materialCost, labourCost, 'CAD', 10, 'kg', '{}'
    );

    if (inputs.length > 0) {
      const insertInput = db.prepare(`
        INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
        VALUES (?, ?, ?, ?)
      `);
      for (const input of inputs) {
        insertInput.run(id, input.id, input.qty, input.unit);
      }
    }
  }

  it('should return zero breakdown when attestation not found', () => {
    const result = computeCanadianContent('non-existent', db);
    expect(result.breakdown.canadianPercent).toBe(0.0);
    expect(result.breakdown.totalDirectCosts).toBe(0);
    expect(result.breakdown.canadianDirectCosts).toBe(0);
    expect(result.breakdown.designation).toBe(Designation.NONE);
    expect(result.breakdown.lastTransformationLocation).toBeNull();
    expect(result.breakdown.isSubstantialTransformation).toBe(false);
  });

  it('should compute 100% Canadian content for a single CA attestation', () => {
    insertAttestation('a1', { location: 'CA', materialCost: 100, labourCost: 50 });
    const result = computeCanadianContent('a1', db);
    expect(result.breakdown.canadianPercent).toBe(100.0);
    expect(result.breakdown.totalDirectCosts).toBe(150);
    expect(result.breakdown.canadianDirectCosts).toBe(150);
  });

  it('should compute 0% Canadian content for a single non-CA attestation', () => {
    insertAttestation('a1', { location: 'US', materialCost: 100, labourCost: 50 });
    const result = computeCanadianContent('a1', db);
    expect(result.breakdown.canadianPercent).toBe(0.0);
    expect(result.breakdown.totalDirectCosts).toBe(150);
    expect(result.breakdown.canadianDirectCosts).toBe(0);
  });

  it('should compute mixed Canadian content across a chain', () => {
    // Raw material from US: cost = 200 + 100 = 300
    insertAttestation('raw', { location: 'US', materialCost: 200, labourCost: 100 });
    // Final product in CA: cost = 100 + 50 = 150
    insertAttestation('final', {
      location: 'CA',
      materialCost: 100,
      labourCost: 50,
      inputs: [{ id: 'raw', qty: 5, unit: 'kg' }],
    });

    const result = computeCanadianContent('final', db);
    // Total = 300 + 150 = 450, Canadian = 150
    // Percentage = (150 / 450) * 100 = 33.33
    expect(result.breakdown.totalDirectCosts).toBe(450);
    expect(result.breakdown.canadianDirectCosts).toBe(150);
    expect(result.breakdown.canadianPercent).toBe(33.33);
  });

  it('should handle zero total costs without division by zero', () => {
    insertAttestation('a1', { location: 'CA', materialCost: 0, labourCost: 0 });
    const result = computeCanadianContent('a1', db);
    expect(result.breakdown.canadianPercent).toBe(0.0);
    expect(result.breakdown.totalDirectCosts).toBe(0);
    expect(result.breakdown.canadianDirectCosts).toBe(0);
  });

  it('should treat negative materialCost as zero with WARNING issue', () => {
    insertAttestation('a1', { location: 'CA', materialCost: -50, labourCost: 100 });
    const result = computeCanadianContent('a1', db);
    // materialCost treated as 0, so total = 0 + 100 = 100
    expect(result.breakdown.totalDirectCosts).toBe(100);
    expect(result.breakdown.canadianDirectCosts).toBe(100);
    expect(result.breakdown.canadianPercent).toBe(100.0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe(Severity.WARNING);
    expect(result.issues[0].type).toBe(IssueType.MISSING_REQUIRED_FIELD);
    expect(result.issues[0].description).toContain('materialCost');
  });

  it('should treat negative labourCost as zero with WARNING issue', () => {
    insertAttestation('a1', { location: 'CA', materialCost: 100, labourCost: -30 });
    const result = computeCanadianContent('a1', db);
    // labourCost treated as 0, so total = 100 + 0 = 100
    expect(result.breakdown.totalDirectCosts).toBe(100);
    expect(result.breakdown.canadianDirectCosts).toBe(100);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe(Severity.WARNING);
    expect(result.issues[0].description).toContain('labourCost');
  });

  it('should treat both negative costs as zero with two WARNING issues', () => {
    insertAttestation('a1', { location: 'CA', materialCost: -10, labourCost: -20 });
    const result = computeCanadianContent('a1', db);
    expect(result.breakdown.totalDirectCosts).toBe(0);
    expect(result.breakdown.canadianDirectCosts).toBe(0);
    expect(result.breakdown.canadianPercent).toBe(0.0);
    expect(result.issues).toHaveLength(2);
  });

  it('should round percentage to 2 decimal places using half-up rounding', () => {
    // Create a scenario where percentage has more than 2 decimal places
    // CA cost = 100, total = 300 → 33.333...% → rounds to 33.33
    insertAttestation('raw', { location: 'US', materialCost: 200, labourCost: 0 });
    insertAttestation('final', {
      location: 'CA',
      materialCost: 100,
      labourCost: 0,
      inputs: [{ id: 'raw', qty: 1, unit: 'kg' }],
    });

    const result = computeCanadianContent('final', db);
    expect(result.breakdown.canadianPercent).toBe(33.33);
  });

  it('should track last transformation location in topological order', () => {
    insertAttestation('raw', { location: 'US', materialCost: 50, labourCost: 50, isTransformation: true });
    insertAttestation('final', {
      location: 'CA',
      materialCost: 50,
      labourCost: 50,
      isTransformation: true,
      inputs: [{ id: 'raw', qty: 5, unit: 'kg' }],
    });

    const result = computeCanadianContent('final', db);
    // Last transformation in topological order is 'final' (CA)
    expect(result.breakdown.lastTransformationLocation).toBe('CA');
    expect(result.breakdown.isSubstantialTransformation).toBe(true);
  });

  it('should set isSubstantialTransformation to false when no transformations exist', () => {
    insertAttestation('a1', { location: 'CA', isTransformation: false });
    const result = computeCanadianContent('a1', db);
    expect(result.breakdown.isSubstantialTransformation).toBe(false);
    expect(result.breakdown.lastTransformationLocation).toBeNull();
    expect(result.breakdown.designation).toBe(Designation.NONE);
  });

  it('should assign PRODUCT_OF_CANADA when >= 98% and last transform in CA', () => {
    // 100% Canadian with transformation
    insertAttestation('a1', { location: 'CA', materialCost: 100, labourCost: 50, isTransformation: true });
    const result = computeCanadianContent('a1', db);
    expect(result.breakdown.designation).toBe(Designation.PRODUCT_OF_CANADA);
  });

  it('should assign MADE_IN_CANADA when >= 51% but < 98% and last transform in CA', () => {
    // CA: 60, US: 40 → 60% Canadian
    insertAttestation('raw', { location: 'US', materialCost: 40, labourCost: 0 });
    insertAttestation('final', {
      location: 'CA',
      materialCost: 60,
      labourCost: 0,
      isTransformation: true,
      inputs: [{ id: 'raw', qty: 1, unit: 'kg' }],
    });

    const result = computeCanadianContent('final', db);
    expect(result.breakdown.designation).toBe(Designation.MADE_IN_CANADA);
  });

  it('should assign NONE when last transformation is not in CA', () => {
    insertAttestation('raw', { location: 'CA', materialCost: 100, labourCost: 0 });
    insertAttestation('final', {
      location: 'US',
      materialCost: 0,
      labourCost: 0,
      isTransformation: true,
      inputs: [{ id: 'raw', qty: 1, unit: 'kg' }],
    });

    const result = computeCanadianContent('final', db);
    // Even though 100% of costs are Canadian, last transform is US
    expect(result.breakdown.designation).toBe(Designation.NONE);
  });
});

describe('determineDesignation', () => {
  it('should return NONE when no substantial transformation', () => {
    expect(determineDesignation(100, null, false)).toBe(Designation.NONE);
  });

  it('should return NONE when last transformation not in CA', () => {
    expect(determineDesignation(100, 'US', true)).toBe(Designation.NONE);
  });

  it('should return PRODUCT_OF_CANADA when >= 98% and last transform in CA', () => {
    expect(determineDesignation(98.0, 'CA', true)).toBe(Designation.PRODUCT_OF_CANADA);
    expect(determineDesignation(99.5, 'CA', true)).toBe(Designation.PRODUCT_OF_CANADA);
    expect(determineDesignation(100.0, 'CA', true)).toBe(Designation.PRODUCT_OF_CANADA);
  });

  it('should return MADE_IN_CANADA when >= 51% but < 98% and last transform in CA', () => {
    expect(determineDesignation(51.0, 'CA', true)).toBe(Designation.MADE_IN_CANADA);
    expect(determineDesignation(75.0, 'CA', true)).toBe(Designation.MADE_IN_CANADA);
    expect(determineDesignation(97.99, 'CA', true)).toBe(Designation.MADE_IN_CANADA);
  });

  it('should return NONE when < 51% even with last transform in CA', () => {
    expect(determineDesignation(50.99, 'CA', true)).toBe(Designation.NONE);
    expect(determineDesignation(0, 'CA', true)).toBe(Designation.NONE);
    expect(determineDesignation(25.5, 'CA', true)).toBe(Designation.NONE);
  });

  it('should return NONE when lastTransformLocation is null', () => {
    expect(determineDesignation(100, null, true)).toBe(Designation.NONE);
  });
});
