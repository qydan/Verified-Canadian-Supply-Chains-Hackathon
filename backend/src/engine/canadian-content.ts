import type Database from 'better-sqlite3';
import type { Attestation, CostBreakdown, Issue } from '../types.js';
import { Designation, IssueType, Severity } from '../types.js';
import { walkAncestors } from './dag.js';
import { topologicalSort } from './topological-sort.js';

/**
 * Rounds a number to 2 decimal places using half-up rounding.
 * JavaScript's Math.round uses "round half to even" (banker's rounding),
 * so we implement half-up explicitly.
 */
function roundHalfUp(value: number): number {
  return Math.round(value * 100 + Number.EPSILON) / 100;
}

/**
 * Computes Canadian content percentage and cost breakdown for a given attestation.
 *
 * Walks the ancestor chain, sums materialCost + labourCost for total direct costs,
 * classifies costs as Canadian only when location === "CA", handles zero total costs
 * (returns 0.0), treats negative costs as zero with WARNING issue, and rounds
 * percentage to 2 decimal places using half-up rounding.
 *
 * @param attestationId - The ID of the attestation to compute Canadian content for
 * @param db - The database instance
 * @returns CostBreakdown with percentage, costs, designation, and any issues
 */
export function computeCanadianContent(
  attestationId: string,
  db: Database.Database
): { breakdown: CostBreakdown; issues: Issue[] } {
  const issues: Issue[] = [];

  // Walk the ancestor chain
  const walkResult = walkAncestors(attestationId, db);

  if (walkResult.error) {
    // Return zero breakdown if attestation not found
    return {
      breakdown: {
        canadianPercent: 0.0,
        totalDirectCosts: 0,
        canadianDirectCosts: 0,
        designation: Designation.NONE,
        lastTransformationLocation: null,
        isSubstantialTransformation: false,
      },
      issues,
    };
  }

  // Include any issues from the walk (e.g., depth truncation)
  issues.push(...walkResult.issues);

  // Sort in topological order (raw materials first, final product last)
  const chain = topologicalSort(walkResult.attestations);

  let totalDirectCosts = 0;
  let canadianDirectCosts = 0;
  let lastTransformationLocation: string | null = null;
  let isSubstantialTransformation = false;

  // Process chain in topological order
  for (const attestation of chain) {
    let materialCost = attestation.materialCost;
    let labourCost = attestation.labourCost;

    // Treat negative costs as zero with WARNING issue
    if (materialCost < 0) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.WARNING,
        attestationId: attestation.id,
        description: `Negative materialCost (${materialCost}) treated as zero`,
        details: { field: 'materialCost', value: materialCost },
      });
      materialCost = 0;
    }

    if (labourCost < 0) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.WARNING,
        attestationId: attestation.id,
        description: `Negative labourCost (${labourCost}) treated as zero`,
        details: { field: 'labourCost', value: labourCost },
      });
      labourCost = 0;
    }

    // Sum direct costs (materialCost + labourCost)
    const stepCost = materialCost + labourCost;
    totalDirectCosts += stepCost;

    // Classify as Canadian only when location === "CA"
    if (attestation.location === 'CA') {
      canadianDirectCosts += stepCost;
    }

    // Track last transformation step in topological order
    if (attestation.isTransformation) {
      lastTransformationLocation = attestation.location;
      isSubstantialTransformation = true;
    }
  }

  // Compute percentage, handling zero total costs
  let canadianPercent: number;
  if (totalDirectCosts === 0) {
    canadianPercent = 0.0;
  } else {
    canadianPercent = roundHalfUp((canadianDirectCosts / totalDirectCosts) * 100);
  }

  // Determine designation
  const designation = determineDesignation(
    canadianPercent,
    lastTransformationLocation,
    isSubstantialTransformation
  );

  return {
    breakdown: {
      canadianPercent,
      totalDirectCosts,
      canadianDirectCosts,
      designation,
      lastTransformationLocation,
      isSubstantialTransformation,
    },
    issues,
  };
}

/**
 * Determines the Canadian content designation based on percentage,
 * last transformation location, and whether a substantial transformation occurred.
 *
 * Rules (applied in precedence order):
 * 1. No transformation → NONE
 * 2. Last transformation not in CA → NONE
 * 3. Percentage >= 98% → PRODUCT_OF_CANADA
 * 4. Percentage >= 51% → MADE_IN_CANADA
 * 5. Otherwise → NONE
 */
export function determineDesignation(
  percentage: number,
  lastTransformLocation: string | null,
  isSubstantial: boolean
): Designation {
  // Rule: Must have a substantial transformation
  if (!isSubstantial) {
    return Designation.NONE;
  }

  // Rule: Last substantial transformation must be in Canada
  if (lastTransformLocation !== 'CA') {
    return Designation.NONE;
  }

  // Product of Canada: >= 98% Canadian content
  if (percentage >= 98.0) {
    return Designation.PRODUCT_OF_CANADA;
  }

  // Made in Canada: >= 51% Canadian content
  if (percentage >= 51.0) {
    return Designation.MADE_IN_CANADA;
  }

  // Below threshold
  return Designation.NONE;
}
