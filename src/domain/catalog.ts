import * as z from 'zod';

import { InputModalitySchema } from './model';

/**
 * Tiga lapis katalog: bundled default, snapshot live, lalu override pengguna.
 * Field yang tidak ada berarti inherit, sedangkan null berarti hapus override.
 */
export const CapabilityStateSchema = z.enum(['supported', 'unsupported', 'unknown']);

const finitePositiveInt = z.number().int().positive();

const CatalogModelFieldsSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().min(1).optional(),
  vendor: z.string().nullable().optional(),
  ownedBy: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  contextWindow: finitePositiveInt.nullable().optional(),
  maxOutputTokens: finitePositiveInt.nullable().optional(),
  reasoningEfforts: z.array(z.string()).optional(),
  inputModalities: z.array(InputModalitySchema).optional(),
  capabilities: z
    .object({
      streaming: CapabilityStateSchema.optional(),
      tools: CapabilityStateSchema.optional(),
      structuredOutput: CapabilityStateSchema.optional(),
      nativeCompaction: CapabilityStateSchema.optional(),
    })
    .optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type CatalogModelFields = z.infer<typeof CatalogModelFieldsSchema>;

export const CatalogDefaultsSchema = z.object({
  schemaVersion: z.literal(1),
  models: z.array(CatalogModelFieldsSchema),
});
export type CatalogDefaults = z.infer<typeof CatalogDefaultsSchema>;

export const CatalogSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  endpointId: z.string().trim().min(1),
  baseUrl: z.string().trim().min(1),
  fetchedAt: z.iso.datetime(),
  models: z.array(CatalogModelFieldsSchema),
});
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;

export const ModelOverrideSchema = CatalogModelFieldsSchema.partial().extend({
  /** null berarti tetap aktif dan dapat dipilih (mode manual). */
  disabledAt: z.iso.datetime().nullable().optional(),
});
export type ModelOverride = z.infer<typeof ModelOverrideSchema>;

export const ModelOverridesFileSchema = z.object({
  schemaVersion: z.literal(1),
  endpoints: z.record(
    z.string(),
    z.object({ models: z.record(z.string(), ModelOverrideSchema) }),
  ),
});
export type ModelOverridesFile = z.infer<typeof ModelOverridesFileSchema>;

/** Model yang hanya ada di riwayat percakapan, bukan di katalog aktif. */
export type HistoryModelEntry = { id: string; displayName: string };

export const HistoryModelsFileSchema = z.object({
  schemaVersion: z.literal(1),
  endpoints: z.record(z.string(), z.record(z.string(), z.object({ displayName: z.string().min(1) }))),
});
export type HistoryModelsFile = z.infer<typeof HistoryModelsFileSchema>;

export const PRICING_KEYS = ['prompt', 'completion', 'input_cache_read', 'minimum_request'] as const;

export const PricingSchema = z.object({
  version: z.string().min(1),
  currency: z.string().min(1),
  prompt: z.string().nullable(),
  completion: z.string().nullable(),
  cacheRead: z.string().nullable(),
  minimumRequest: z.string().nullable(),
});
export type Pricing = z.infer<typeof PricingSchema>;

/** Hanya dipakai untuk menampilkan kembali nilai asli provider pada layar detail. */
export function pricingFromRaw(raw: Record<string, unknown>): Pricing | null {
  const pricing = raw.pricing;
  if (typeof pricing !== 'object' || pricing === null) {
    return null;
  }
  const record = pricing as Record<string, unknown>;
  const version = typeof raw.pricing_version === 'string' ? raw.pricing_version : null;
  const currency = typeof record.currency === 'string' ? record.currency : null;
  if (version === null || currency === null) {
    return null;
  }
  return {
    version,
    currency,
    prompt: pricingValue(record.prompt),
    completion: pricingValue(record.completion),
    cacheRead: pricingValue(record.input_cache_read),
    minimumRequest: pricingValue(record.minimum_request),
  };
}

function pricingValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === 'string' && value.length > 0 ? value : null;
}
