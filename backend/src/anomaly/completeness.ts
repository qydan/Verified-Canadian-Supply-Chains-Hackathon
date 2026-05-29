/**
 * Anomaly Detection - Incomplete Data
 *
 * Detects:
 * - Missing required fields (MISSING_REQUIRED_FIELD, CRITICAL)
 * - Negative materialCost or labourCost (MISSING_REQUIRED_FIELD, WARNING)
 * - Zero or negative outputQuantity (MISSING_REQUIRED_FIELD, WARNING)
 * - Invalid ISO 3166-1 alpha-2 country code (MISSING_REQUIRED_FIELD, WARNING)
 *
 * Attestations with only WARNING issues are still allowed to be stored.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import type { Issue } from '../types.js';
import { IssueType, Severity } from '../types.js';

/**
 * Valid ISO 3166-1 alpha-2 country codes.
 */
const ISO_3166_1_ALPHA_2: ReadonlySet<string> = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW',
  'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT',
  'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS',
  'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
]);

/**
 * Required fields for an attestation payload.
 */
const REQUIRED_FIELDS = [
  'productName',
  'productId',
  'supplierId',
  'location',
  'materialCost',
  'labourCost',
  'outputQuantity',
  'outputUnit',
  'timestamp',
  'isTransformation',
] as const;

/**
 * Checks completeness of an attestation payload.
 *
 * Validates required field presence and value constraints.
 * Returns CRITICAL issues for missing fields and WARNING issues for invalid values.
 * Attestations with only WARNING issues are still allowed to be stored.
 */
export function checkCompleteness(payload: unknown): Issue[] {
  const issues: Issue[] = [];

  // If payload is not an object, flag all required fields as missing
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    for (const field of REQUIRED_FIELDS) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.CRITICAL,
        attestationId: '',
        description: `Required field '${field}' is missing`,
        details: { field },
      });
    }
    return issues;
  }

  const obj = payload as Record<string, unknown>;

  // Check required fields for null/undefined
  for (const field of REQUIRED_FIELDS) {
    if (obj[field] === null || obj[field] === undefined) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.CRITICAL,
        attestationId: '',
        description: `Required field '${field}' is missing`,
        details: { field },
      });
    }
  }

  // Check materialCost is non-negative (only if present)
  if (obj.materialCost !== null && obj.materialCost !== undefined && typeof obj.materialCost === 'number') {
    if (obj.materialCost < 0) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.WARNING,
        attestationId: '',
        description: `materialCost is negative: ${obj.materialCost}`,
        details: { field: 'materialCost', value: obj.materialCost },
      });
    }
  }

  // Check labourCost is non-negative (only if present)
  if (obj.labourCost !== null && obj.labourCost !== undefined && typeof obj.labourCost === 'number') {
    if (obj.labourCost < 0) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.WARNING,
        attestationId: '',
        description: `labourCost is negative: ${obj.labourCost}`,
        details: { field: 'labourCost', value: obj.labourCost },
      });
    }
  }

  // Check outputQuantity is positive (only if present)
  if (obj.outputQuantity !== null && obj.outputQuantity !== undefined && typeof obj.outputQuantity === 'number') {
    if (obj.outputQuantity <= 0) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.WARNING,
        attestationId: '',
        description: `outputQuantity is zero or negative: ${obj.outputQuantity}`,
        details: { field: 'outputQuantity', value: obj.outputQuantity },
      });
    }
  }

  // Check location is a valid ISO 3166-1 alpha-2 country code (only if present and is a string)
  if (obj.location !== null && obj.location !== undefined && typeof obj.location === 'string') {
    if (!ISO_3166_1_ALPHA_2.has(obj.location)) {
      issues.push({
        type: IssueType.MISSING_REQUIRED_FIELD,
        severity: Severity.WARNING,
        attestationId: '',
        description: `Invalid ISO 3166-1 alpha-2 country code: '${obj.location}'`,
        details: { field: 'location', value: obj.location },
      });
    }
  }

  return issues;
}
