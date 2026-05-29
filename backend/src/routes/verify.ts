/**
 * POST /verify endpoint
 *
 * Accepts an attestation ID, walks the ancestor chain, verifies all signatures,
 * runs anomaly detection, computes Canadian content, and returns a VerificationResult.
 *
 * Requirements: 2.1, 16.1
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { walkAncestors } from '../engine/dag.js';
import { topologicalSort } from '../engine/topological-sort.js';
import { verifyAttestation } from '../crypto/signature.js';
import { detectAllForChain } from '../anomaly/detector.js';
import { computeCanadianContent } from '../engine/canadian-content.js';
import type { VerificationResult, Attestation, Issue } from '../types.js';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const db = req.app.get('db') as Database.Database | undefined;
  if (!db) {
    res.status(503).json({ error: 'Service temporarily unavailable: database not initialized' });
    return;
  }

  const { attestationId } = req.body || {};

  if (!attestationId || typeof attestationId !== 'string') {
    res.status(400).json({ error: 'Missing required field: attestationId' });
    return;
  }

  // Walk the ancestor chain
  const walkResult = walkAncestors(attestationId, db);

  if (walkResult.error) {
    res.status(404).json({ error: walkResult.error });
    return;
  }

  // Topologically sort the chain (raw materials first, final product last)
  const chain: Attestation[] = topologicalSort(walkResult.attestations);

  // Verify all signatures in the chain
  let allSignaturesValid = true;
  for (const attestation of chain) {
    const result = verifyAttestation(attestation);
    if (!result.signatureValid) {
      allSignaturesValid = false;
      break;
    }
  }

  // Run anomaly detection on the entire chain
  const issues: Issue[] = [...walkResult.issues, ...detectAllForChain(chain, db)];

  // Compute Canadian content and designation
  const { breakdown } = computeCanadianContent(attestationId, db);

  const verificationResult: VerificationResult = {
    attestationId,
    allSignaturesValid,
    issues,
    chain,
    designation: breakdown.designation,
    canadianContentPercent: breakdown.canadianPercent,
  };

  res.status(200).json(verificationResult);
});

export default router;
