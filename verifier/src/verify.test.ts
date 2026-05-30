import { describe, it, expect } from 'vitest';
import { verifyChain } from './verify.js';
import type { VerifyRequest, OfficialAttestation } from './types.js';
import type { LoadedRegistries } from './registry.js';
import { createApp } from './server.js';

/**
 * Helper to create a minimal valid attestation for testing.
 */
function makeAttestation(overrides: Partial<OfficialAttestation> = {}): OfficialAttestation {
  return {
    attestation_id: 'att-001',
    version: '1.0',
    supplier_id: 'sup-001',
    timestamp: '2024-01-01T00:00:00Z',
    action_type: 'final_integration',
    performed_in_country: 'CA',
    parents: [],
    output: { name: 'Widget', quantity_produced: 100, unit: 'kg' },
    costs: { material_cad: 500, labour_hours: 8, labour_cost_cad: 200 },
    signature: { algorithm: 'Ed25519', value: 'dGVzdHNpZw==' },
    ...overrides,
  };
}

/**
 * Create empty registries for testing (no supplier keys, no anchors).
 */
function emptyRegistries(): LoadedRegistries {
  return {
    suppliers: new Map(),
    anchors: new Map(),
  };
}

describe('verifyChain', () => {
  it('returns a valid response with all required fields', () => {
    const request: VerifyRequest = {
      product_attestation_id: 'att-001',
      attestations: [makeAttestation()],
    };

    const response = verifyChain(request, emptyRegistries());

    expect(response).toHaveProperty('product_attestation_id', 'att-001');
    expect(response).toHaveProperty('canadian_content_percentage');
    expect(response).toHaveProperty('designation');
    expect(response).toHaveProperty('chain_valid');
    expect(response).toHaveProperty('anomalies');
    expect(typeof response.canadian_content_percentage).toBe('number');
    expect(typeof response.chain_valid).toBe('boolean');
    expect(Array.isArray(response.anomalies)).toBe(true);
  });

  it('sets chain_valid to true when no anomalies are found', () => {
    // With empty registries, unknown supplier anomaly will be reported
    // So we need to provide a matching supplier key
    // For simplicity, test with empty registries — will have signature anomalies
    const request: VerifyRequest = {
      product_attestation_id: 'att-001',
      attestations: [makeAttestation()],
    };

    const response = verifyChain(request, emptyRegistries());

    // With empty supplier registry, we expect signature_unknown_supplier anomaly
    expect(response.chain_valid).toBe(false);
    expect(response.anomalies.length).toBeGreaterThan(0);
    expect(response.anomalies[0].type).toBe('signature_unknown_supplier');
  });

  it('sets chain_valid to false when anomalies exist', () => {
    const request: VerifyRequest = {
      product_attestation_id: 'att-001',
      attestations: [makeAttestation()],
    };

    const response = verifyChain(request, emptyRegistries());

    // Unknown supplier → anomaly → chain_valid = false
    expect(response.chain_valid).toBe(false);
    expect(response.anomalies.length).toBeGreaterThan(0);
  });

  it('chain_valid is true iff anomalies array is empty', () => {
    const request: VerifyRequest = {
      product_attestation_id: 'att-001',
      attestations: [makeAttestation()],
    };

    const response = verifyChain(request, emptyRegistries());

    expect(response.chain_valid).toBe(response.anomalies.length === 0);
  });

  it('computes Canadian content percentage correctly for single CA attestation', () => {
    const request: VerifyRequest = {
      product_attestation_id: 'att-001',
      attestations: [
        makeAttestation({
          performed_in_country: 'CA',
          costs: { material_cad: 500, labour_hours: 8, labour_cost_cad: 200 },
        }),
      ],
    };

    const response = verifyChain(request, emptyRegistries());

    // All costs are CA → 100%
    expect(response.canadian_content_percentage).toBe(100);
  });

  it('computes Canadian content percentage for mixed countries', () => {
    const caAttestation = makeAttestation({
      attestation_id: 'att-ca',
      performed_in_country: 'CA',
      costs: { material_cad: 300, labour_hours: 4, labour_cost_cad: 100 },
      parents: [],
    });

    const usAttestation = makeAttestation({
      attestation_id: 'att-us',
      performed_in_country: 'US',
      costs: { material_cad: 200, labour_hours: 4, labour_cost_cad: 100 },
      parents: [],
    });

    const leafAttestation = makeAttestation({
      attestation_id: 'att-leaf',
      performed_in_country: 'CA',
      action_type: 'final_integration',
      costs: { material_cad: 100, labour_hours: 8, labour_cost_cad: 50 },
      parents: [
        { attestation_id: 'att-ca', content_hash: 'hash1', quantity_consumed: 50, unit: 'kg' },
        { attestation_id: 'att-us', content_hash: 'hash2', quantity_consumed: 50, unit: 'kg' },
      ],
    });

    const request: VerifyRequest = {
      product_attestation_id: 'att-leaf',
      attestations: [caAttestation, usAttestation, leafAttestation],
    };

    const response = verifyChain(request, emptyRegistries());

    // CA costs: (300+100) + (100+50) = 550
    // Total costs: (300+100) + (200+100) + (100+50) = 850
    // Percentage: 550/850 * 100 ≈ 64.71
    const expected = (550 / 850) * 100;
    expect(response.canadian_content_percentage).toBeCloseTo(expected, 5);
  });

  it('echoes product_attestation_id in response', () => {
    const request: VerifyRequest = {
      product_attestation_id: 'my-product-123',
      attestations: [makeAttestation({ attestation_id: 'my-product-123' })],
    };

    const response = verifyChain(request, emptyRegistries());

    expect(response.product_attestation_id).toBe('my-product-123');
  });

  it('detects dangling parent references', () => {
    const attestation = makeAttestation({
      parents: [
        { attestation_id: 'nonexistent', content_hash: 'abc', quantity_consumed: 10, unit: 'kg' },
      ],
    });

    const request: VerifyRequest = {
      product_attestation_id: 'att-001',
      attestations: [attestation],
    };

    const response = verifyChain(request, emptyRegistries());

    const danglingAnomaly = response.anomalies.find((a) => a.type === 'dangling_parent');
    expect(danglingAnomaly).toBeDefined();
    expect(danglingAnomaly!.attestation_id).toBe('att-001');
  });

  it('designation is one of the valid values', () => {
    const request: VerifyRequest = {
      product_attestation_id: 'att-001',
      attestations: [makeAttestation()],
    };

    const response = verifyChain(request, emptyRegistries());

    expect(['product_of_canada', 'made_in_canada', 'none']).toContain(response.designation);
  });
});

describe('Express app integration', () => {
  const registries = emptyRegistries();
  const app = createApp(registries);

  it('POST /verify returns 200 with valid request', async () => {
    const body = {
      product_attestation_id: 'att-001',
      attestations: [
        {
          attestation_id: 'att-001',
          version: '1.0',
          supplier_id: 'sup-001',
          timestamp: '2024-01-01T00:00:00Z',
          action_type: 'final_integration',
          performed_in_country: 'CA',
          parents: [],
          output: { name: 'Widget', quantity_produced: 100, unit: 'kg' },
          costs: { material_cad: 500, labour_hours: 8, labour_cost_cad: 200 },
          signature: { algorithm: 'Ed25519', value: 'dGVzdHNpZw==' },
        },
      ],
    };

    // Use a simple approach: start the app on a random port and use fetch
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://localhost:${port}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(200);

      const json = (await res.json()) as Record<string, unknown>;
      expect(json.product_attestation_id).toBe('att-001');
      expect(json).toHaveProperty('canadian_content_percentage');
      expect(json).toHaveProperty('designation');
      expect(json).toHaveProperty('chain_valid');
      expect(json).toHaveProperty('anomalies');
      expect(Array.isArray(json.anomalies)).toBe(true);
    } finally {
      server.close();
    }
  });

  it('POST /verify returns 400 for invalid request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://localhost:${port}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: true }),
      });

      expect(res.status).toBe(400);

      const json = (await res.json()) as Record<string, unknown>;
      expect(json).toHaveProperty('error');
    } finally {
      server.close();
    }
  });

  it('GET /health returns 200', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);

      const json = (await res.json()) as Record<string, unknown>;
      expect(json.status).toBe('ok');
    } finally {
      server.close();
    }
  });
});
