import { describe, it, expect } from 'vitest';
import { checkCompleteness } from './completeness.js';
import { IssueType, Severity } from '../types.js';

describe('checkCompleteness', () => {
  const validPayload = {
    productName: 'Maple Syrup',
    productId: '123e4567-e89b-12d3-a456-426614174000',
    supplierId: '123e4567-e89b-12d3-a456-426614174001',
    location: 'CA',
    materialCost: 10.5,
    labourCost: 5.0,
    outputQuantity: 100,
    outputUnit: 'L',
    timestamp: '2024-01-01T00:00:00Z',
    isTransformation: true,
    inputs: [],
  };

  it('should return no issues for a valid payload', () => {
    const issues = checkCompleteness(validPayload);
    expect(issues).toHaveLength(0);
  });

  it('should flag CRITICAL for each null required field', () => {
    const payload = { ...validPayload, productName: null, productId: null };
    const issues = checkCompleteness(payload);
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL);
    expect(criticals).toHaveLength(2);
    expect(criticals[0].type).toBe(IssueType.MISSING_REQUIRED_FIELD);
    expect(criticals[0].details?.field).toBe('productName');
    expect(criticals[1].details?.field).toBe('productId');
  });

  it('should flag CRITICAL for each undefined required field', () => {
    const { productName, supplierId, ...rest } = validPayload;
    const issues = checkCompleteness(rest);
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL);
    expect(criticals).toHaveLength(2);
    const fields = criticals.map(i => i.details?.field);
    expect(fields).toContain('productName');
    expect(fields).toContain('supplierId');
  });

  it('should flag CRITICAL for all required fields when payload is null', () => {
    const issues = checkCompleteness(null);
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL);
    expect(criticals).toHaveLength(10);
  });

  it('should flag CRITICAL for all required fields when payload is undefined', () => {
    const issues = checkCompleteness(undefined);
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL);
    expect(criticals).toHaveLength(10);
  });

  it('should flag WARNING for negative materialCost', () => {
    const payload = { ...validPayload, materialCost: -5 };
    const issues = checkCompleteness(payload);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe(IssueType.MISSING_REQUIRED_FIELD);
    expect(warnings[0].details?.field).toBe('materialCost');
  });

  it('should flag WARNING for negative labourCost', () => {
    const payload = { ...validPayload, labourCost: -3.5 };
    const issues = checkCompleteness(payload);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe(IssueType.MISSING_REQUIRED_FIELD);
    expect(warnings[0].details?.field).toBe('labourCost');
  });

  it('should flag WARNING for zero outputQuantity', () => {
    const payload = { ...validPayload, outputQuantity: 0 };
    const issues = checkCompleteness(payload);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details?.field).toBe('outputQuantity');
  });

  it('should flag WARNING for negative outputQuantity', () => {
    const payload = { ...validPayload, outputQuantity: -10 };
    const issues = checkCompleteness(payload);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details?.field).toBe('outputQuantity');
  });

  it('should flag WARNING for invalid ISO 3166-1 alpha-2 country code', () => {
    const payload = { ...validPayload, location: 'XX' };
    const issues = checkCompleteness(payload);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details?.field).toBe('location');
    expect(warnings[0].details?.value).toBe('XX');
  });

  it('should not flag WARNING for valid country codes', () => {
    for (const code of ['CA', 'US', 'GB', 'DE', 'JP', 'AU']) {
      const payload = { ...validPayload, location: code };
      const issues = checkCompleteness(payload);
      expect(issues).toHaveLength(0);
    }
  });

  it('should flag WARNING for lowercase country code (case-sensitive)', () => {
    const payload = { ...validPayload, location: 'ca' };
    const issues = checkCompleteness(payload);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details?.field).toBe('location');
  });

  it('should allow storage when only WARNING issues exist (no CRITICAL)', () => {
    const payload = { ...validPayload, materialCost: -1, labourCost: -2, outputQuantity: -5 };
    const issues = checkCompleteness(payload);
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(criticals).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should handle non-object payload types', () => {
    const issues = checkCompleteness('not an object');
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL);
    expect(criticals).toHaveLength(10);
  });

  it('should not flag WARNING for materialCost when it is null (already CRITICAL)', () => {
    const payload = { ...validPayload, materialCost: null };
    const issues = checkCompleteness(payload);
    const warnings = issues.filter(i => i.severity === Severity.WARNING && i.details?.field === 'materialCost');
    expect(warnings).toHaveLength(0);
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL && i.details?.field === 'materialCost');
    expect(criticals).toHaveLength(1);
  });

  it('should flag both CRITICAL and WARNING for different fields', () => {
    const { productName, ...rest } = validPayload;
    const payload = { ...rest, materialCost: -5 };
    const issues = checkCompleteness(payload);
    const criticals = issues.filter(i => i.severity === Severity.CRITICAL);
    const warnings = issues.filter(i => i.severity === Severity.WARNING);
    expect(criticals).toHaveLength(1);
    expect(criticals[0].details?.field).toBe('productName');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].details?.field).toBe('materialCost');
  });
});
