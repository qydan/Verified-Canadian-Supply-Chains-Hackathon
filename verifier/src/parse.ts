import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

const ParentReferenceSchema = z.object({
  attestation_id: z.string(),
  content_hash: z.string(),
  quantity_consumed: z.number(),
  unit: z.string(),
});

const OutputInfoSchema = z.object({
  name: z.string(),
  quantity_produced: z.number(),
  unit: z.string(),
});

const CostInfoSchema = z.object({
  material_cad: z.number(),
  labour_hours: z.number(),
  labour_cost_cad: z.number(),
});

const SignatureInfoSchema = z.object({
  algorithm: z.string(),
  value: z.string(),
});

const OfficialAttestationSchema = z.object({
  attestation_id: z.string(),
  version: z.string(),
  supplier_id: z.string(),
  timestamp: z.string(),
  action_type: z.enum([
    'raw_material_supply',
    'component_manufacture',
    'subassembly',
    'final_integration',
  ]),
  performed_in_country: z.string(),
  parents: z.array(ParentReferenceSchema),
  output: OutputInfoSchema,
  costs: CostInfoSchema,
  signature: SignatureInfoSchema,
});

export const VerifyRequestSchema = z.object({
  product_attestation_id: z.string({
    required_error: 'product_attestation_id is required and must be a string',
    invalid_type_error: 'product_attestation_id is required and must be a string',
  }),
  attestations: z
    .array(OfficialAttestationSchema, {
      required_error: 'attestations is required and must be a non-empty array',
      invalid_type_error: 'attestations is required and must be a non-empty array',
    })
    .min(1, 'attestations is required and must be a non-empty array'),
});

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export type ParseResult =
  | { success: true; data: VerifyRequest }
  | { success: false; error: string };

/**
 * Parse and validate a request body against the VerifyRequest schema.
 * Returns a discriminated union with either the parsed data or an error message.
 */
export function parseVerifyRequest(body: unknown): ParseResult {
  if (body === undefined || body === null || typeof body !== 'object') {
    return { success: false, error: 'Invalid JSON' };
  }

  const obj = body as Record<string, unknown>;

  if (
    !('product_attestation_id' in obj) ||
    typeof obj.product_attestation_id !== 'string'
  ) {
    return {
      success: false,
      error: 'product_attestation_id is required and must be a string',
    };
  }

  if (
    !('attestations' in obj) ||
    !Array.isArray(obj.attestations) ||
    obj.attestations.length === 0
  ) {
    return {
      success: false,
      error: 'attestations is required and must be a non-empty array',
    };
  }

  const result = VerifyRequestSchema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: firstError.message };
  }

  return { success: true, data: result.data };
}

/**
 * Express middleware that validates the request body against the VerifyRequest schema.
 * Returns 400 with an error message on validation failure.
 */
export function validateVerifyRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = VerifyRequestSchema.safeParse(req.body);

  if (!result.success) {
    const firstError = result.error.errors[0];

    // Determine the appropriate error message based on which field failed
    if (
      firstError.path[0] === 'product_attestation_id' ||
      firstError.path.length === 0
    ) {
      // Check if it's a product_attestation_id issue
      if (
        req.body === undefined ||
        req.body === null ||
        typeof req.body !== 'object'
      ) {
        res.status(400).json({ error: 'Invalid JSON' });
        return;
      }

      if (
        !('product_attestation_id' in req.body) ||
        typeof req.body.product_attestation_id !== 'string'
      ) {
        res.status(400).json({
          error: 'product_attestation_id is required and must be a string',
        });
        return;
      }
    }

    if (firstError.path[0] === 'attestations' || firstError.path.length === 0) {
      if (
        !('attestations' in req.body) ||
        !Array.isArray(req.body.attestations) ||
        req.body.attestations.length === 0
      ) {
        res.status(400).json({
          error: 'attestations is required and must be a non-empty array',
        });
        return;
      }
    }

    // Generic fallback for other validation errors
    res.status(400).json({ error: firstError.message });
    return;
  }

  next();
}
