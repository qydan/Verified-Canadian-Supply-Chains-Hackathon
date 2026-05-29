/**
 * POST /attestations endpoint
 *
 * Handles attestation submission with validation in strict order per Requirement 1.9:
 * 1. Required field presence → 400
 * 2. Signature/publicKey byte lengths → 400
 * 3. Ed25519 signature verification → 400
 * 4. Duplicate content hash → 409
 * 5. Cycle detection → 400
 *
 * On success: stores attestation, runs anomaly detection, returns 201 with {id, contentHash, issues}
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { canonicalize } from '../crypto/canonicalize.js';
import { verifySignature, computeContentHash } from '../crypto/signature.js';
import { detectCycle } from '../engine/dag.js';
import { detectAll } from '../anomaly/detector.js';
import type { Attestation, InputReference, Issue } from '../types.js';
import { IssueType, Severity } from '../types.js';

const router = Router();

/**
 * Required fields in the attestation payload.
 */
const REQUIRED_PAYLOAD_FIELDS = [
  'productName',
  'productId',
  'supplierId',
  'location',
  'materialCost',
  'labourCost',
  'outputQuantity',
  'outputUnit',
  'timestamp',
  'isTransformation',
] as const;

/**
 * Converts a hexadecimal string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

router.post('/', (req: Request, res: Response) => {
  const db = req.app.get('db') as Database.Database | undefined;
  if (!db) {
    res.status(503).json({ error: 'Service temporarily unavailable: database not initialized' });
    return;
  }

  const { payload, signature, publicKey } = req.body || {};

  // === Step 1: Validate required fields presence (Req 1.5, 1.9) ===
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({
      error: 'Missing required fields',
      missingFields: ['payload'],
    });
    return;
  }

  if (signature === undefined || signature === null) {
    res.status(400).json({
      error: 'Missing required fields',
      missingFields: ['signature'],
    });
    return;
  }

  if (publicKey === undefined || publicKey === null) {
    res.status(400).json({
      error: 'Missing required fields',
      missingFields: ['publicKey'],
    });
    return;
  }

  // Check required payload fields
  const missingFields: string[] = [];
  for (const field of REQUIRED_PAYLOAD_FIELDS) {
    if (payload[field] === undefined || payload[field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    res.status(400).json({
      error: 'Missing required fields',
      missingFields,
    });
    return;
  }

  // === Step 2: Validate byte lengths (Req 1.8, 1.9) ===
  const signatureBytes = hexToBytes(signature);
  const publicKeyBytes = hexToBytes(publicKey);

  if (signatureBytes.length !== 64) {
    res.status(400).json({
      error: 'Invalid field length: signature must be exactly 64 bytes',
    });
    return;
  }

  if (publicKeyBytes.length !== 32) {
    res.status(400).json({
      error: 'Invalid field length: publicKey must be exactly 32 bytes',
    });
    return;
  }

  // === Step 3: Verify Ed25519 signature (Req 1.2, 1.9) ===
  const canonicalBytes = canonicalize(payload);
  const signatureValid = verifySignature(canonicalBytes, signatureBytes, publicKeyBytes);

  if (!signatureValid) {
    res.status(400).json({
      error: 'Signature verification failed',
    });
    return;
  }

  // === Step 4: Check duplicate content hash (Req 1.3, 1.9) ===
  const contentHash = computeContentHash(payload);

  const existing = db.prepare('SELECT id FROM attestations WHERE content_hash = ?').get(contentHash);
  if (existing) {
    res.status(409).json({
      error: 'Duplicate attestation: content hash already exists',
    });
    return;
  }

  // === Step 5: Cycle detection (Req 1.4, 1.9) ===
  const inputs: InputReference[] = Array.isArray(payload.inputs)
    ? payload.inputs.map((inp: any) => ({
        attestationId: inp.attestationId,
        quantityUsed: inp.quantityUsed,
        unit: inp.unit,
      }))
    : [];

  if (inputs.length > 0) {
    const hasCycle = detectCycle(inputs, contentHash, db);
    if (hasCycle) {
      res.status(400).json({
        error: 'Cycle detected in supply chain',
      });
      return;
    }
  }

  // === All validations passed - store the attestation ===
  const attestationId = uuidv4();

  // Store the attestation
  const insertAttestation = db.prepare(`
    INSERT INTO attestations (
      id, content_hash, supplier_id, public_key, signature, timestamp,
      product_name, product_id, is_transformation, location,
      material_cost, labour_cost, currency, output_quantity, output_unit, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAttestation.run(
    attestationId,
    contentHash,
    payload.supplierId,
    publicKey,
    signature,
    payload.timestamp,
    payload.productName,
    payload.productId,
    payload.isTransformation ? 1 : 0,
    payload.location,
    payload.materialCost,
    payload.labourCost,
    payload.currency || 'CAD',
    payload.outputQuantity,
    payload.outputUnit,
    JSON.stringify(payload),
  );

  // Store input references
  if (inputs.length > 0) {
    const insertInput = db.prepare(`
      INSERT INTO input_references (attestation_id, input_attestation_id, quantity_used, unit)
      VALUES (?, ?, ?, ?)
    `);

    for (const input of inputs) {
      insertInput.run(attestationId, input.attestationId, input.quantityUsed, input.unit);
    }
  }

  // === Run anomaly detection and collect issues ===
  const attestation: Attestation = {
    id: attestationId,
    contentHash,
    supplierId: payload.supplierId,
    publicKey,
    signature,
    timestamp: payload.timestamp,
    productName: payload.productName,
    productId: payload.productId,
    isTransformation: payload.isTransformation,
    location: payload.location,
    materialCost: payload.materialCost,
    labourCost: payload.labourCost,
    currency: payload.currency || 'CAD',
    inputs,
    outputQuantity: payload.outputQuantity,
    outputUnit: payload.outputUnit,
  };

  const issues = detectAll(attestation, db);

  // Store issues in the database
  if (issues.length > 0) {
    const insertIssue = db.prepare(`
      INSERT INTO issues (id, attestation_id, type, severity, description, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const issue of issues) {
      insertIssue.run(
        uuidv4(),
        attestationId,
        issue.type,
        issue.severity,
        issue.description,
        issue.details ? JSON.stringify(issue.details) : null,
      );
    }
  }

  // Return 201 with attestation ID, content hash, and issues
  res.status(201).json({
    id: attestationId,
    contentHash,
    issues,
  });
});

/**
 * GET /attestations/:id
 *
 * Returns a single attestation by its UUID id.
 * Reconstructs the full Attestation object including input_references.
 * Returns 404 if not found.
 *
 * Requirements: 2.1, 16.1
 */
router.get('/:id', (req: Request, res: Response) => {
  const db = req.app.get('db') as Database.Database | undefined;
  if (!db) {
    res.status(503).json({ error: 'Service temporarily unavailable: database not initialized' });
    return;
  }

  const { id } = req.params;

  // Look up the attestation by ID
  const row = db.prepare('SELECT * FROM attestations WHERE id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: 'Attestation not found' });
    return;
  }

  // Load input references
  const inputRows = db.prepare(
    'SELECT input_attestation_id, quantity_used, unit FROM input_references WHERE attestation_id = ?'
  ).all(id) as Array<{ input_attestation_id: string; quantity_used: number; unit: string }>;

  const inputs: InputReference[] = inputRows.map((r) => ({
    attestationId: r.input_attestation_id,
    quantityUsed: r.quantity_used,
    unit: r.unit,
  }));

  // Reconstruct the full Attestation object
  const attestation: Attestation = {
    id: row.id,
    contentHash: row.content_hash,
    supplierId: row.supplier_id,
    publicKey: row.public_key,
    signature: row.signature,
    timestamp: row.timestamp,
    productName: row.product_name,
    productId: row.product_id,
    isTransformation: row.is_transformation === 1,
    location: row.location,
    materialCost: row.material_cost,
    labourCost: row.labour_cost,
    currency: row.currency,
    inputs,
    outputQuantity: row.output_quantity,
    outputUnit: row.output_unit,
  };

  res.status(200).json(attestation);
});

export default router;
