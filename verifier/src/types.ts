/** Official attestation schema (on-the-wire format from scoring harness) */
export interface OfficialAttestation {
  attestation_id: string;
  version: string;
  supplier_id: string;
  timestamp: string;
  action_type:
    | 'raw_material_supply'
    | 'component_manufacture'
    | 'subassembly'
    | 'final_integration';
  performed_in_country: string;
  parents: ParentReference[];
  output: OutputInfo;
  costs: CostInfo;
  signature: SignatureInfo;
}

export interface ParentReference {
  attestation_id: string;
  content_hash: string;
  quantity_consumed: number;
  unit: string;
}

export interface OutputInfo {
  name: string;
  quantity_produced: number;
  unit: string;
}

export interface CostInfo {
  material_cad: number;
  labour_hours: number;
  labour_cost_cad: number;
}

export interface SignatureInfo {
  algorithm: string;
  value: string; // base64-encoded Ed25519 signature
}

/** Request body from scoring harness */
export interface VerifyRequest {
  product_attestation_id: string;
  attestations: OfficialAttestation[];
}

/** Response to scoring harness */
export interface VerifyResponse {
  product_attestation_id: string;
  canadian_content_percentage: number;
  designation: 'product_of_canada' | 'made_in_canada' | 'none';
  chain_valid: boolean;
  anomalies: Anomaly[];
}

export interface Anomaly {
  type: string;
  attestation_id: string;
  details: string;
}
