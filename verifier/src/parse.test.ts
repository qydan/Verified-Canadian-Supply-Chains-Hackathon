import { describe, it, expect } from 'vitest';
import { VerifyRequestSchema } from './parse.js';

describe('VerifyRequestSchema', () => {
  const validAttestation = {
    attestation_id: 'att-001',
    version: '1.0',
    supplier_id: 'sup-001',
    timestamp: '2024-01-01T00:00:00Z',
    action_type: 'raw_material_supply' as const,
    performed_in_country: 'CA',
    parents: [],
    output: { name: 'Steel', quantity_produced: 100, unit: 'kg' },
    costs: { material_cad: 500, labour_hours: 8, labour_cost_cad: 200 },
    signature: { algorithm: 'Ed25519', value: 'abc123==' },
  };

  it('accepts a valid request', () => {
    const result = VerifyRequestSchema.safeParse({
      product_attestation_id: 'att-001',
      attestations: [validAttestation],
    });
    expect(result.success).toBe(true);
  });

  it('rejects when product_attestation_id is missing', () => {
    const result = VerifyRequestSchema.safeParse({
      attestations: [validAttestation],
    });
    expect(result.success).toBe(false);
  });

  it('rejects when product_attestation_id is not a string', () => {
    const result = VerifyRequestSchema.safeParse({
      product_attestation_id: 123,
      attestations: [validAttestation],
    });
    expect(result.success).toBe(false);
  });

  it('rejects when attestations is missing', () => {
    const result = VerifyRequestSchema.safeParse({
      product_attestation_id: 'att-001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when attestations is not an array', () => {
    const result = VerifyRequestSchema.safeParse({
      product_attestation_id: 'att-001',
      attestations: 'not-an-array',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when attestations array is empty', () => {
    const result = VerifyRequestSchema.safeParse({
      product_attestation_id: 'att-001',
      attestations: [],
    });
    expect(result.success).toBe(false);
  });

  it('provides appropriate error for missing product_attestation_id', () => {
    const result = VerifyRequestSchema.safeParse({
      attestations: [validAttestation],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.errors;
      expect(errors.some((e) => e.path.includes('product_attestation_id'))).toBe(
        true
      );
    }
  });

  it('provides appropriate error for empty attestations', () => {
    const result = VerifyRequestSchema.safeParse({
      product_attestation_id: 'att-001',
      attestations: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.errors;
      expect(
        errors.some(
          (e) =>
            e.message === 'attestations is required and must be a non-empty array'
        )
      ).toBe(true);
    }
  });
});
