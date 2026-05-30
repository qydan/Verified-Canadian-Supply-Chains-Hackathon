import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistries } from './registry.js';
import { verifyChain } from './verify.js';
import type { VerifyRequest } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryDir = join(__dirname, '..', 'registry');
const workedExampleDir = join(
  __dirname,
  '..',
  '..',
  'provenance-hackathon-main',
  'worked-example'
);

describe('Worked Example: Recovery Drone Chain', () => {
  const registries = loadRegistries(registryDir);

  const chainRaw = readFileSync(
    join(workedExampleDir, 'recovery_drone_chain.json'),
    'utf-8'
  );
  const chain: VerifyRequest = JSON.parse(chainRaw);

  const expectedRaw = readFileSync(
    join(workedExampleDir, 'recovery_drone_expected.json'),
    'utf-8'
  );
  const expected = JSON.parse(expectedRaw);

  it('should produce the expected verification result', () => {
    const result = verifyChain(chain, registries);

    // product_attestation_id must match exactly
    expect(result.product_attestation_id).toBe('att-anchor-0012');

    // canadian_content_percentage should be approximately 58.4 (±0.5)
    expect(result.canadian_content_percentage).toBeCloseTo(58.4, 0);
    expect(
      Math.abs(result.canadian_content_percentage - 58.4)
    ).toBeLessThanOrEqual(0.5);

    // designation must be "made_in_canada"
    expect(result.designation).toBe('made_in_canada');

    // chain_valid must be true
    expect(result.chain_valid).toBe(true);

    // anomalies must be empty
    expect(result.anomalies).toEqual([]);
  });

  it('should match the expected output file values', () => {
    const result = verifyChain(chain, registries);

    expect(result.product_attestation_id).toBe(expected.product_attestation_id);
    expect(result.designation).toBe(expected.designation);
    expect(result.chain_valid).toBe(expected.chain_valid);
    expect(result.anomalies).toEqual(expected.anomalies);
    expect(result.canadian_content_percentage).toBeCloseTo(
      expected.canadian_content_percentage,
      1
    );
  });
});
