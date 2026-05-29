// ============================================================================
// Enumerations
// ============================================================================

/** Canadian content designation per Competition Bureau guidelines */
export enum Designation {
  /** >= 98% Canadian content + last substantial transformation in Canada */
  PRODUCT_OF_CANADA = 'PRODUCT_OF_CANADA',
  /** >= 51% Canadian content + last substantial transformation in Canada */
  MADE_IN_CANADA = 'MADE_IN_CANADA',
  /** Does not qualify for either designation */
  NONE = 'NONE',
}

/** Types of anomalies detected in the supply chain */
export enum IssueType {
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  UNREGISTERED_SUPPLIER = 'UNREGISTERED_SUPPLIER',
  MODIFIED_PAYLOAD = 'MODIFIED_PAYLOAD',
  REPLAY_DETECTED = 'REPLAY_DETECTED',
  QUANTITY_EXCEEDS_UPSTREAM = 'QUANTITY_EXCEEDS_UPSTREAM',
  MISSING_REFERENCE = 'MISSING_REFERENCE',
  BROKEN_LINK = 'BROKEN_LINK',
  IMPOSSIBLE_ORDERING = 'IMPOSSIBLE_ORDERING',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  CYCLE_DETECTED = 'CYCLE_DETECTED',
}

/** Severity levels for detected issues */
export enum Severity {
  /** Invalidates the chain */
  CRITICAL = 'CRITICAL',
  /** Suspicious but not conclusive */
  WARNING = 'WARNING',
  /** Informational only */
  INFO = 'INFO',
}

// ============================================================================
// Core Data Models
// ============================================================================

/** A reference to an upstream attestation used as input */
export interface InputReference {
  attestationId: string;
  quantityUsed: number;
  unit: string;
}

/** A digitally signed record of a supply chain step */
export interface Attestation {
  id: string;
  contentHash: string;
  supplierId: string;
  publicKey: string;
  signature: string;
  timestamp: string;
  productName: string;
  productId: string;
  isTransformation: boolean;
  location: string;
  materialCost: number;
  labourCost: number;
  currency: string;
  inputs: InputReference[];
  outputQuantity: number;
  outputUnit: string;
}

/** A registered supplier in the system */
export interface Supplier {
  id: string;
  name: string;
  publicKey: string;
  location: string;
  registeredAt: string;
  isActive: boolean;
}

/** A detected anomaly or issue in the supply chain */
export interface Issue {
  type: IssueType;
  severity: Severity;
  attestationId: string;
  description: string;
  details?: Record<string, unknown>;
}

/** Breakdown of costs for Canadian content computation */
export interface CostBreakdown {
  canadianPercent: number;
  totalDirectCosts: number;
  canadianDirectCosts: number;
  designation: Designation;
  lastTransformationLocation: string | null;
  isSubstantialTransformation: boolean;
}

/** Full provenance report for a product */
export interface ProvenanceReport {
  productId: string;
  productName: string;
  designation: Designation;
  canadianContentPercent: number;
  totalDirectCosts: number;
  canadianDirectCosts: number;
  lastTransformationLocation: string | null;
  isSubstantialTransformation: boolean;
  chain: Attestation[];
  issues: Issue[];
  chainDepth: number;
  allSignaturesValid: boolean;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

// --- POST /attestations ---

/** Request body for submitting a new attestation */
export interface AttestationRequest {
  payload: AttestationPayload;
  signature: string;
  publicKey: string;
}

/** The attestation payload that gets signed */
export interface AttestationPayload {
  productName: string;
  productId: string;
  supplierId: string;
  location: string;
  materialCost: number;
  labourCost: number;
  currency?: string;
  outputQuantity: number;
  outputUnit: string;
  timestamp: string;
  isTransformation: boolean;
  inputs: InputReference[];
}

/** Response from a successful attestation submission */
export interface AttestationResponse {
  id: string;
  contentHash: string;
  issues: Issue[];
}

// --- POST /suppliers ---

/** Request body for registering a new supplier */
export interface SupplierRequest {
  name: string;
  publicKey: string;
  location: string;
}

/** Response from a successful supplier registration */
export interface SupplierResponse extends Supplier {}

// --- POST /verify ---

/** Request body for verifying an attestation chain */
export interface VerificationRequest {
  attestationId: string;
}

/** Result of a full chain verification */
export interface VerificationResult {
  attestationId: string;
  allSignaturesValid: boolean;
  issues: Issue[];
  chain: Attestation[];
  designation: Designation;
  canadianContentPercent: number;
}

// --- GET /health ---

/** Health check response */
export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  database?: 'connected' | 'unavailable';
}

// ============================================================================
// Internal Types
// ============================================================================

/** Result of signature verification */
export interface SignatureResult {
  valid: boolean;
  signatureValid: boolean;
  contentHashValid: boolean;
  issues: Issue[];
}

/** Error response format */
export interface ErrorResponse {
  error: string;
  details?: unknown;
}
