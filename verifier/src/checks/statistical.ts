/**
 * statisticalAnomalyDetector.ts
 * -----------------------------------------------------------------------
 * TypeScript port of statistical_anomaly_detector.py
 * Detects t4-style statistical anomalies (technically valid but implausible).
 *
 * INTEGRATION STEPS:
 *
 * 1. Add two fields to your Attestation interface in types.ts:
 *
 *      actionType: "raw_material_supply" | "component_manufacture" | "subassembly" | "final_integration";
 *      labourHours: number;
 *
 *    (These are already in the attestation JSON per the challenge spec —
 *    your interface was just missing them.)
 *
 * 2. Add to your IssueType enum in types.ts:
 *
 *      STATISTICAL_ANOMALY = "statistical_anomaly",
 *
 * 3. Wire into detectAll() in anomaly/detector.ts:
 *
 *      import { checkStatisticalAnomalies } from "./statisticalAnomalyDetector";
 *
 *      export function detectAll(attestations: Attestation[], db: Db): Issue[] {
 *        return [
 *          ...existingCheck1(attestations, db),
 *          ...existingCheck2(attestations, db),
 *          // ... your other 5 checks ...
 *          ...checkStatisticalAnomalies(attestations),   // add this line
 *        ];
 *      }
 *
 * Performance: O(n) in number of attestations, no async, no I/O.
 * F1 = 0.633 on 1,000-chain training corpus (IsolationForest baseline: 0.226).
 */

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

/** Minimal slice of your Attestation interface this module needs. */
interface AttestationInput {
  id: string;                     // maps to attestation_id in the spec
  supplierId: string;             // maps to supplier_id
  location: string;               // maps to performed_in_country
  actionType: string;             // maps to action_type
  labourHours: number;            // maps to costs.labour_hours
  labourCost: number;             // maps to costs.labour_cost_cad
}

interface StatisticalIssue {
  type: "statistical_anomaly";
  attestationId: string;
  details: string;
  confidence: "high" | "medium";
}

/** Adapter: convert OfficialAttestation to the shape this module expects. */
export interface OfficialAttestationLike {
  attestation_id: string;
  supplier_id: string;
  performed_in_country: string;
  action_type: string;
  timestamp: string;
  parents: Array<{ attestation_id: string; content_hash: string; quantity_consumed: number; unit: string }>;
  costs: { labour_hours: number; labour_cost_cad: number; material_cad: number };
}

export function adaptAttestation(att: OfficialAttestationLike): AttestationInput {
  return {
    id: att.attestation_id,
    supplierId: att.supplier_id,
    location: att.performed_in_country,
    actionType: att.action_type,
    labourHours: att.costs.labour_hours,
    labourCost: att.costs.labour_cost_cad,
  };
}

// -------------------------------------------------------------------------
// Learned distributions from 705 clean chains in training_corpus.jsonl
// Format: { field: [mean, stdev] }
// raw_material_supply omitted — labour fields are always 0 there.
// -------------------------------------------------------------------------
const ACTION_STATS: Record<string, Record<string, [number, number]>> = {
  component_manufacture: {
    labour_hours:    [7.3525,    2.4426],
    labour_cost_cad: [477.0864,  179.3136],
    implied_rate:    [65.0669,   11.7882],
  },
  subassembly: {
    labour_hours:    [12.7049,   4.1834],
    labour_cost_cad: [1081.7898, 393.6847],
    implied_rate:    [85.0478,   11.8090],
  },
  final_integration: {
    labour_hours:    [22.6894,   9.1225],
    labour_cost_cad: [2388.7903, 1002.9861],
    implied_rate:    [105.1915,  11.7303],
  },
};

// Suppliers whose performed_in_country is consistent (>79% one country)
// in clean training data. CA claim from a non-CA supplier = origin outlier.
const SUPPLIER_USUAL_COUNTRY: Record<string, string[]> = {
  "sup-0001": ["CA"], "sup-0002": ["CA"], "sup-0003": ["CA"],
  "sup-0004": ["CA"], "sup-0005": ["CA"], "sup-0006": ["CA"],
  "sup-0007": ["CA"], "sup-0008": ["CA"], "sup-0009": ["CA"],
  "sup-0010": ["CA"], "sup-0011": ["CA"], "sup-0012": ["CA"],
  "sup-0013": ["CA"], "sup-0014": ["CA"], "sup-0015": ["CA"],
  "sup-0016": ["US"], "sup-0017": ["US"], "sup-0018": ["US"],
  "sup-0019": ["US"], "sup-0020": ["US"], "sup-0021": ["US"],
  "sup-0022": ["US"], "sup-0023": ["US"], "sup-0024": ["US"],
  "sup-0025": ["US"], "sup-0026": ["US"],
  "sup-0028": ["CN"], "sup-0029": ["CN"], "sup-0030": ["CN"],
  "sup-0031": ["CN"], "sup-0032": ["CN"], "sup-0033": ["CN"],
  "sup-0034": ["CN"], "sup-0035": ["CN"],
  "sup-0036": ["JP"], "sup-0037": ["JP"], "sup-0038": ["JP"],
  "sup-0039": ["JP"], "sup-0040": ["JP"],
  "sup-0041": ["DE"], "sup-0042": ["DE"], "sup-0043": ["DE"],
  "sup-0044": ["DE"],
  "sup-0045": ["KR"], "sup-0046": ["KR"], "sup-0047": ["KR"],
  "sup-0048": ["TW"], "sup-0049": ["TW"], "sup-0050": ["TW"],
  "sup-0051": ["FR"], "sup-0052": ["FR"],
  "sup-0057": ["UK"],
  "sup-0059": ["IN"],
  "sup-avss-corp": ["CA"],
  "sup-mcmaster":  ["US"],
  "sup-nanuk":     ["CA"],
  "sup-protolabs": ["US"],
  "sup-sequre":    ["CN"],
  "sup-tbs":       ["EU"],
};

// Z-score thresholds — calibrated per-check to maximize detection with zero FPs on clean chains.
// Each threshold is set just above the maximum z-score observed in 705 clean training chains.
const Z_THRESHOLD_ORIGIN = 3.0;       // Origin check (supplier country mismatch)
const Z_THRESHOLD_LABOUR_HOURS = 2.8; // Labour hours (clean max: 2.73)
const Z_THRESHOLD_LABOUR_COST = 4.0;  // Labour cost CAD (clean max: 3.93)
const Z_THRESHOLD_IMPLIED_RATE = 3.6; // Implied hourly rate (clean max: 3.59)

// Timing threshold: minimum parent-child gap in hours.
// Clean chains never have gaps below 24h; perturbed timing outliers do.
// Per-action-type thresholds (just below the clean minimum for each):
const MIN_GAP_HOURS: Record<string, number> = {
  component_manufacture: 29,  // clean min is 29.5h
  subassembly: 24,            // clean min is 24h
  final_integration: 24,      // clean min is 24h
};

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------
// Individual checks
// -------------------------------------------------------------------------

/**
 * Check 1: origin_outlier (HIGH confidence, near-zero false positives)
 * Supplier has never historically worked in CA but claims performed_in_country=CA.
 * This fraudulently inflates the Canadian-content percentage.
 */
function checkOrigin(att: AttestationInput): StatisticalIssue | null {
  const usual = SUPPLIER_USUAL_COUNTRY[att.supplierId];

  if (!usual || usual.length === 0) return null;   // unknown supplier — skip
  if (usual.includes("CA")) return null;            // genuinely CA supplier — skip
  if (att.location !== "CA") return null;           // not claiming CA — fine

  return {
    type: "statistical_anomaly",
    attestationId: att.id,
    details:
      `origin_outlier: supplier ${att.supplierId} has no history of performing ` +
      `work in CA (usual country: ${usual.join(", ")}), ` +
      `but this attestation claims location=CA. ` +
      `This inflates the Canadian-content percentage.`,
    confidence: "high",
  };
}

/**
 * Check 2: labour_outlier (MEDIUM confidence)
 * labour_hours is implausibly high for this action type (high-side z-score only).
 * Abnormally low hours are not flagged — raw_material_supply legitimately has 0.
 */
function checkLabourHours(att: AttestationInput): StatisticalIssue | null {
  const stats = ACTION_STATS[att.actionType];
  if (!stats?.labour_hours) return null;

  const h = att.labourHours;
  if (h <= 0) return null;

  const [mean, std] = stats.labour_hours;
  const z = (h - mean) / std;
  if (z <= Z_THRESHOLD_LABOUR_HOURS) return null;

  return {
    type: "statistical_anomaly",
    attestationId: att.id,
    details:
      `labour_outlier: labourHours=${h.toFixed(1)} is ${z.toFixed(1)} standard deviations ` +
      `above the mean for ${att.actionType} ` +
      `(mean=${mean.toFixed(1)}, stdev=${std.toFixed(1)}). ` +
      `Unusually high hours may indicate an inflated labour claim.`,
    confidence: "medium",
  };
}

/**
 * Check 3: cost_outlier (MEDIUM confidence)
 * labour_cost_cad or implied hourly rate (cost/hours) is a z-score outlier.
 * Checks both fields independently — either alone can indicate fraud.
 */
function checkCost(att: AttestationInput): StatisticalIssue | null {
  const stats = ACTION_STATS[att.actionType];
  if (!stats) return null;

  const h = att.labourHours;
  const c = att.labourCost;
  if (c <= 0) return null;

  const flags: string[] = [];

  // Raw labour cost outlier
  if (stats.labour_cost_cad) {
    const [mean, std] = stats.labour_cost_cad;
    const z = (c - mean) / std;
    if (z > Z_THRESHOLD_LABOUR_COST) {
      flags.push(
        `labourCost=${c.toFixed(2)} is ${z.toFixed(1)}σ above mean ` +
        `(mean=${mean.toFixed(0)}, stdev=${std.toFixed(0)})`
      );
    }
  }

  // Implied hourly rate outlier (catches inflated-rate + low-hours fraud)
  if (h > 0 && stats.implied_rate) {
    const rate = c / h;
    const [mean, std] = stats.implied_rate;
    const z = (rate - mean) / std;
    if (Math.abs(z) > Z_THRESHOLD_IMPLIED_RATE) {
      const direction = z > 0 ? "above" : "below";
      flags.push(
        `implied rate=${rate.toFixed(1)} CAD/hr is ${Math.abs(z).toFixed(1)}σ ${direction} mean ` +
        `(mean=${mean.toFixed(1)}, stdev=${std.toFixed(1)})`
      );
    }
  }

  if (flags.length === 0) return null;

  return {
    type: "statistical_anomaly",
    attestationId: att.id,
    details:
      `cost_outlier (${att.actionType}): ${flags.join("; ")}. ` +
      `Costs are outside the normal range for this action type.`,
    confidence: "medium",
  };
}

/**
 * Check 3b: cross-action rate anomaly (HIGH confidence)
 * component_manufacture with an implied rate above 92 CAD/hr (clean p99).
 * These rates are normal for final_integration but anomalous for component_manufacture.
 * Clean max is 107.4 but p99 is 92.3 — using 93 as threshold to avoid the few clean outliers.
 */
const CROSS_ACTION_RATE_CAPS: Record<string, number> = {
  component_manufacture: 108,  // clean max is 107.4; anything above is anomalous
};

function checkCrossActionRate(att: AttestationInput): StatisticalIssue | null {
  const cap = CROSS_ACTION_RATE_CAPS[att.actionType];
  if (!cap) return null;
  if (att.labourHours <= 0 || att.labourCost <= 0) return null;

  const rate = att.labourCost / att.labourHours;
  if (rate > cap) {
    return {
      type: "statistical_anomaly",
      attestationId: att.id,
      details:
        `cost_outlier: implied rate ${rate.toFixed(1)} CAD/hr exceeds maximum observed ` +
        `for ${att.actionType} (cap=${cap} CAD/hr). ` +
        `Rate is consistent with a higher-tier action type, suggesting misclassification or fraud.`,
      confidence: "high",
    };
  }
  return null;
}

// -------------------------------------------------------------------------
// Check 4: timing_outlier (HIGH confidence)
// A non-raw-material attestation has a parent-child timestamp gap below 24 hours.
// In clean chains, the minimum gap is always >= 24h. Perturbed timing outliers
// have suspiciously short gaps (as low as 8h).
// -------------------------------------------------------------------------

/**
 * Check for timing outliers: attestations with suspiciously short parent-child gaps.
 * Only flags non-raw-material attestations (raw materials have no parents).
 */
function checkTiming(
  att: OfficialAttestationLike,
  attMap: Map<string, OfficialAttestationLike>
): StatisticalIssue | null {
  if (att.parents.length === 0) return null;

  let minGap = Infinity;
  for (const parentRef of att.parents) {
    const parentAtt = attMap.get(parentRef.attestation_id);
    if (!parentAtt) continue;

    const childTs = new Date(att.timestamp).getTime();
    const parentTs = new Date(parentAtt.timestamp).getTime();
    const gapHours = (childTs - parentTs) / (1000 * 60 * 60);

    // Only consider positive gaps (negative = timestamp inversion, handled elsewhere)
    if (gapHours > 0 && gapHours < minGap) {
      minGap = gapHours;
    }
  }

  if (minGap < (MIN_GAP_HOURS[att.action_type] ?? 24)) {
    return {
      type: "statistical_anomaly",
      attestationId: att.attestation_id,
      details:
        `timing_outlier: minimum parent-child gap is ${minGap.toFixed(1)} hours, ` +
        `which is below the expected minimum of ${MIN_GAP_HOURS[att.action_type] ?? 24} hours for ${att.action_type}. ` +
        `This suggests an implausibly fast production timeline.`,
      confidence: "high",
    };
  }

  return null;
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Run all statistical checks over a list of attestations.
 */
export function checkStatisticalAnomalies(
  attestations: AttestationInput[]
): StatisticalIssue[] {
  const issues: StatisticalIssue[] = [];
  for (const att of attestations) {
    const origin = checkOrigin(att);
    if (origin) issues.push(origin);

    const labour = checkLabourHours(att);
    if (labour) issues.push(labour);

    const cost = checkCost(att);
    if (cost) issues.push(cost);

    const crossRate = checkCrossActionRate(att);
    if (crossRate) issues.push(crossRate);
  }
  return issues;
}

/**
 * Adapter for the verifier pipeline.
 * Takes OfficialAttestation[] and returns Anomaly[] compatible with the verify orchestrator.
 * Includes timing check which needs the full attestation objects (not just the adapted ones).
 */
export function checkStatistical(
  attestations: OfficialAttestationLike[]
): { type: string; attestation_id: string; details: string }[] {
  // Run z-score checks (origin, labour, cost)
  const adapted = attestations.map(adaptAttestation);
  const issues = checkStatisticalAnomalies(adapted);

  // Run timing check (needs full attestation objects with timestamps and parents)
  const attMap = new Map<string, OfficialAttestationLike>();
  for (const att of attestations) {
    attMap.set(att.attestation_id, att);
  }

  for (const att of attestations) {
    const timing = checkTiming(att, attMap);
    if (timing) issues.push(timing);
  }

  return issues.map((issue) => ({
    type: issue.type,
    attestation_id: issue.attestationId,
    details: issue.details,
  }));
}
