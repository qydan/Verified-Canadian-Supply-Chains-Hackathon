/**
 * GET /products/:id/provenance endpoint
 *
 * Returns a full ProvenanceReport for a given product ID, including:
 * - Canadian content designation and percentage
 * - Topologically sorted attestation chain
 * - Signature verification status
 * - All detected anomalies across 5 categories
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { Attestation, InputReference, ProvenanceReport } from '../types.js';
import { Designation } from '../types.js';
import { walkAncestors } from '../engine/dag.js';
import { topologicalSort } from '../engine/topological-sort.js';
import { verifyAttestation } from '../crypto/signature.js';
import { computeCanadianContent } from '../engine/canadian-content.js';
import { detectAllForChain } from '../anomaly/detector.js';

const router = Router();

interface AttestationRow {
  id: string;
  content_hash: string;
  supplier_id: string;
  public_key: string;
  signature: string;
  timestamp: string;
  product_name: string;
  product_id: string;
  is_transformation: number;
  location: string;
  material_cost: number;
  labour_cost: number;
  currency: string;
  output_quantity: number;
  output_unit: string;
  payload_json: string;
}

interface InputReferenceRow {
  input_attestation_id: string;
  quantity_used: number;
  unit: string;
}

/**
 * Converts a database row into an Attestation object.
 */
function rowToAttestation(row: AttestationRow, inputs: InputReference[]): Attestation {
  return {
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
}

/**
 * GET /products/:id/provenance
 *
 * Retrieves the full provenance report for a product.
 *
 * - Finds attestation by productId → 404 if not found
 * - Walks ancestor chain and topologically sorts
 * - Verifies all signatures in chain (sets allSignaturesValid)
 * - Computes Canadian content and designation
 * - Runs all 5 anomaly detection categories on every attestation in chain
 * - Returns full ProvenanceReport
 */
router.get('/:id/provenance', (req: Request, res: Response) => {
  const db = req.app.get('db') as Database.Database | undefined;
  if (!db) {
    res.status(503).json({ error: 'Service temporarily unavailable: database not initialized' });
    return;
  }

  const productId = req.params.id as string;

  // Find attestation by productId (Req 2.2: 404 if not found)
  const row = db.prepare(
    'SELECT * FROM attestations WHERE product_id = ? ORDER BY timestamp DESC LIMIT 1'
  ).get(productId) as AttestationRow | undefined;

  if (!row) {
    res.status(404).json({ error: `Product not found: ${productId}` });
    return;
  }

  // Load input references for the found attestation
  const inputRows = db.prepare(
    'SELECT input_attestation_id, quantity_used, unit FROM input_references WHERE attestation_id = ?'
  ).all(row.id) as InputReferenceRow[];

  const inputs: InputReference[] = inputRows.map((r) => ({
    attestationId: r.input_attestation_id,
    quantityUsed: r.quantity_used,
    unit: r.unit,
  }));

  const startAttestation = rowToAttestation(row, inputs);

  // Walk ancestor chain (Req 5.1, 5.3)
  const walkResult = walkAncestors(startAttestation.id, db);

  if (walkResult.error) {
    res.status(500).json({ error: 'Failed to walk ancestor chain' });
    return;
  }

  // Topologically sort the chain (raw materials first, final product last)
  const chain = topologicalSort(walkResult.attestations);

  // Verify all signatures in chain (Req 2.3)
  let allSignaturesValid = true;
  for (const attestation of chain) {
    const result = verifyAttestation(attestation);
    if (!result.valid) {
      allSignaturesValid = false;
      break;
    }
  }

  // Compute Canadian content and designation (Req 6.x, 7.x)
  const { breakdown } = computeCanadianContent(startAttestation.id, db);

  // Run all 5 anomaly detection categories on every attestation in chain (Req 2.4)
  const issues = [...walkResult.issues, ...detectAllForChain(chain, db)];

  // Compute chain depth (number of levels in the chain)
  const chainDepth = chain.length;

  // Handle Req 2.5: chain with no transformation steps → designation NONE, lastTransformationLocation null
  // This is already handled by computeCanadianContent/determineDesignation

  // Build and return the full ProvenanceReport (Req 2.1)
  const report: ProvenanceReport = {
    productId,
    productName: startAttestation.productName,
    designation: breakdown.designation,
    canadianContentPercent: breakdown.canadianPercent,
    totalDirectCosts: breakdown.totalDirectCosts,
    canadianDirectCosts: breakdown.canadianDirectCosts,
    lastTransformationLocation: breakdown.lastTransformationLocation,
    isSubstantialTransformation: breakdown.isSubstantialTransformation,
    chain,
    issues,
    chainDepth,
    allSignaturesValid,
  };

  res.status(200).json(report);
});

export default router;
