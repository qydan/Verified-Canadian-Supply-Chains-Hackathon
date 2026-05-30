/**
 * Signature verification check.
 *
 * For each attestation:
 * 1. Look up supplier_id in the suppliers map → if not found, report `signature_unknown_supplier`
 * 2. Compute canonical bytes (excluding signature)
 * 3. Decode the base64 signature value
 * 4. Verify Ed25519 detached signature against the supplier's public key
 * 5. If verification fails → report `signature_invalid`
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import nacl from 'tweetnacl';
import { canonicalSerialize } from '../canonical.js';
import type { OfficialAttestation, Anomaly } from '../types.js';

/**
 * Verify Ed25519 signatures on all attestations against the supplier registry.
 *
 * @param attestations - Array of attestations to verify
 * @param suppliers - Map of supplier_id → decoded 32-byte Ed25519 public key
 * @returns Array of anomalies for signature failures or unknown suppliers
 */
export function checkSignatures(
  attestations: OfficialAttestation[],
  suppliers: Map<string, Uint8Array>
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const attestation of attestations) {
    const publicKey = suppliers.get(attestation.supplier_id);

    // Unknown supplier — can't verify signature
    if (!publicKey) {
      anomalies.push({
        type: 'signature_unknown_supplier',
        attestation_id: attestation.attestation_id,
        details: `Supplier "${attestation.supplier_id}" not found in supplier registry`,
      });
      continue;
    }

    // Compute canonical bytes (signature excluded)
    const canonicalBytes = canonicalSerialize(
      attestation as unknown as Record<string, unknown>,
      true
    );

    // Decode base64 signature
    const signatureBytes = Buffer.from(attestation.signature.value, 'base64');

    // Verify Ed25519 detached signature
    // tweetnacl throws if signature is not exactly 64 bytes, so we guard against that
    let valid = false;
    try {
      if (signatureBytes.length === 64) {
        valid = nacl.sign.detached.verify(
          canonicalBytes,
          new Uint8Array(signatureBytes),
          publicKey
        );
      }
    } catch {
      // Any verification error means invalid signature
      valid = false;
    }

    if (!valid) {
      anomalies.push({
        type: 'signature_invalid',
        attestation_id: attestation.attestation_id,
        details: `Ed25519 signature verification failed for supplier "${attestation.supplier_id}"`,
      });
    }
  }

  return anomalies;
}
