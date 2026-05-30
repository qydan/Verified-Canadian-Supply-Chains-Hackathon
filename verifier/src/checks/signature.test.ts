import { describe, it, expect } from 'vitest';
import { checkSignatures } from './signature.js';
import type { OfficialAttestation } from '../types.js';

// Golden test vectors from the Python reference (test_golden.py)
const GOLDEN_PUB_B64 = 'A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=';
const GOLDEN_SIG =
  'sSWieMGMjTmxGHL4ewUx5whpW0rBQQDQNYWaxJiI0HE5qTKk17ipptr1zfb5BOIHET4m/+O3qyGxJvSktCYqCw==';

const GOLDEN_ATT: OfficialAttestation = {
  attestation_id: 'att-golden-0001',
  version: '1.0',
  supplier_id: 'sup-avss-corp',
  timestamp: '2026-04-15T14:30:00Z',
  action_type: 'component_manufacture',
  performed_in_country: 'CA',
  parents: [
    {
      attestation_id: 'att-parent-aaaa',
      content_hash: 'deadbeef',
      quantity_consumed: 8.0,
      unit: 'm2',
    },
  ],
  output: { name: 'Parachute Assembly', quantity_produced: 1, unit: 'units' },
  costs: { material_cad: 0.0, labour_hours: 6.5, labour_cost_cad: 520.0 },
  signature: { algorithm: 'ed25519', value: GOLDEN_SIG },
};

function makeSupplierMap(
  entries: [string, string][]
): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const [id, b64Key] of entries) {
    map.set(id, new Uint8Array(Buffer.from(b64Key, 'base64')));
  }
  return map;
}

describe('checkSignatures', () => {
  it('should pass for a valid signature (golden vector)', () => {
    const suppliers = makeSupplierMap([['sup-avss-corp', GOLDEN_PUB_B64]]);
    const anomalies = checkSignatures([GOLDEN_ATT], suppliers);
    expect(anomalies).toEqual([]);
  });

  it('should report signature_invalid for a tampered attestation', () => {
    const suppliers = makeSupplierMap([['sup-avss-corp', GOLDEN_PUB_B64]]);
    // Tamper with the costs
    const tampered: OfficialAttestation = {
      ...GOLDEN_ATT,
      costs: { ...GOLDEN_ATT.costs, labour_cost_cad: 9999.0 },
    };
    const anomalies = checkSignatures([tampered], suppliers);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('signature_invalid');
    expect(anomalies[0].attestation_id).toBe('att-golden-0001');
  });

  it('should report signature_invalid for a corrupted signature value', () => {
    const suppliers = makeSupplierMap([['sup-avss-corp', GOLDEN_PUB_B64]]);
    const corrupted: OfficialAttestation = {
      ...GOLDEN_ATT,
      signature: { algorithm: 'ed25519', value: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    };
    const anomalies = checkSignatures([corrupted], suppliers);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('signature_invalid');
    expect(anomalies[0].attestation_id).toBe('att-golden-0001');
  });

  it('should report signature_unknown_supplier when supplier_id not in registry', () => {
    const suppliers = makeSupplierMap([['sup-other', GOLDEN_PUB_B64]]);
    const anomalies = checkSignatures([GOLDEN_ATT], suppliers);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('signature_unknown_supplier');
    expect(anomalies[0].attestation_id).toBe('att-golden-0001');
    expect(anomalies[0].details).toContain('sup-avss-corp');
  });

  it('should report signature_invalid when using wrong public key', () => {
    // Use a different key (all zeros, 32 bytes)
    const wrongKey = Buffer.alloc(32, 0).toString('base64');
    const suppliers = makeSupplierMap([['sup-avss-corp', wrongKey]]);
    const anomalies = checkSignatures([GOLDEN_ATT], suppliers);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('signature_invalid');
    expect(anomalies[0].attestation_id).toBe('att-golden-0001');
  });

  it('should handle multiple attestations with mixed results', () => {
    const suppliers = makeSupplierMap([['sup-avss-corp', GOLDEN_PUB_B64]]);

    const unknownSupplier: OfficialAttestation = {
      ...GOLDEN_ATT,
      attestation_id: 'att-unknown-supplier',
      supplier_id: 'sup-unknown',
    };

    const tampered: OfficialAttestation = {
      ...GOLDEN_ATT,
      attestation_id: 'att-tampered',
      costs: { ...GOLDEN_ATT.costs, material_cad: 100 },
    };

    const anomalies = checkSignatures(
      [GOLDEN_ATT, unknownSupplier, tampered],
      suppliers
    );

    // Golden should pass, unknown supplier should fail, tampered should fail
    expect(anomalies).toHaveLength(2);

    const unknownAnomaly = anomalies.find(
      (a) => a.attestation_id === 'att-unknown-supplier'
    );
    expect(unknownAnomaly?.type).toBe('signature_unknown_supplier');

    const tamperedAnomaly = anomalies.find(
      (a) => a.attestation_id === 'att-tampered'
    );
    expect(tamperedAnomaly?.type).toBe('signature_invalid');
  });

  it('should return empty array for empty attestations input', () => {
    const suppliers = makeSupplierMap([['sup-avss-corp', GOLDEN_PUB_B64]]);
    const anomalies = checkSignatures([], suppliers);
    expect(anomalies).toEqual([]);
  });
});
