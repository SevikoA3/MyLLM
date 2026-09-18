import * as z from 'zod';

import { InputModalitySchema } from './model';
import { ContextPolicySchema } from './context';

/**
 * Tiga lapis katalog: bundled default, snapshot live, lalu override pengguna.
 * Field yang tidak ada berarti inherit, sedangkan null berarti hapus override.
 */
export const CapabilityStateSchema = z.enum(['supported', 'unsupported', 'unknown']);

const finitePositiveInt = z.number().int().positive();

const ReasoningEffortsSchema = z
  .array(z.string().trim().min(1))
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: `Duplicate reasoning effort: ${value}.`,
        });
      }
      seen.add(value);
    });
  });

const CatalogModelFieldsSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().min(1).optional(),
  vendor: z.string().nullable().optional(),
  ownedBy: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  contextWindow: finitePositiveInt.nullable().optional(),
  maxOutputTokens: finitePositiveInt.nullable().optional(),
  reasoningEfforts: ReasoningEffortsSchema.optional(),
  inputModalities: z.array(InputModalitySchema).optional(),
  capabilities: z
    .object({
      streaming: CapabilityStateSchema.optional(),
      tools: CapabilityStateSchema.optional(),
      structuredOutput: CapabilityStateSchema.optional(),
      nativeCompaction: CapabilityStateSchema.optional(),
    })
    .optional(),
  contextPolicy: ContextPolicySchema.optional(),
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

const CapabilityOverridesSchema = z
  .object({
    streaming: CapabilityStateSchema.nullable().optional(),
    tools: CapabilityStateSchema.nullable().optional(),
    structuredOutput: CapabilityStateSchema.nullable().optional(),
    nativeCompaction: CapabilityStateSchema.nullable().optional(),
  })
  .strict();

export const ModelRequestOverrideSchema = z
  .object({
    reasoningEffort: z.string().trim().min(1).nullable().optional(),
    outputLimit: finitePositiveInt.nullable().optional(),
  })
  .strict();
export type ModelRequestOverride = z.infer<typeof ModelRequestOverrideSchema>;

export const ModelOverrideSchema = z
  .object({
    displayName: z.string().trim().min(1).nullable().optional(),
    enabled: z.boolean().nullable().optional(),
    vendor: z.string().nullable().optional(),
    ownedBy: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    contextWindow: finitePositiveInt.nullable().optional(),
    maxOutputTokens: finitePositiveInt.nullable().optional(),
    reasoningEfforts: ReasoningEffortsSchema.nullable().optional(),
    inputModalities: z.array(InputModalitySchema).nullable().optional(),
    capabilities: CapabilityOverridesSchema.nullable().optional(),
    request: ModelRequestOverrideSchema.nullable().optional(),
    contextPolicy: ContextPolicySchema.nullable().optional(),
    raw: z.record(z.string(), z.unknown()).nullable().optional(),
    /** Dibaca untuk kompatibilitas file fase 3; penulisan baru memakai enabled. */
    disabledAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export type ModelOverride = z.infer<typeof ModelOverrideSchema>;

export const ModelOverridesFileSchema = z.object({
  schemaVersion: z.literal(1),
  endpoints: z.record(
    z.string(),
    z.object({ models: z.record(z.string().trim().min(1), ModelOverrideSchema) }).strict(),
  ),
}).strict();
export type ModelOverridesFile = z.infer<typeof ModelOverridesFileSchema>;

export type OverrideValidationFailure = {
  ok: false;
  path: string;
  message: string;
};

export type OverrideValidationResult =
  | { ok: true; value: ModelOverridesFile }
  | OverrideValidationFailure;

/** Parse satu kali di memory; file aktif belum disentuh sampai hasil valid. */
export function parseModelOverridesText(text: string): OverrideValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, path: '$', message: 'JSON is invalid.' };
  }
  if (isRecord(value) && typeof value.schemaVersion === 'number' && value.schemaVersion > 1) {
    return {
      ok: false,
      path: '$.schemaVersion',
      message: 'The schema is newer. Upgrade the app to import this file.',
    };
  }
  const parsed = ModelOverridesFileSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const issue = parsed.error.issues[0];
  const suffix = issue.path.length === 0 ? '' : '.' + issue.path.map(String).join('.');
  return { ok: false, path: '$' + suffix, message: issue.message };
}

export function changedOverrideModelIds(
  current: ModelOverridesFile,
  next: ModelOverridesFile,
  endpointId: string,
): string[] {
  const before = current.endpoints[endpointId]?.models ?? {};
  const after = next.endpoints[endpointId]?.models ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((id) => JSON.stringify(before[id]) !== JSON.stringify(after[id]))
    .sort();
}

export function serializeModelOverrides(value: ModelOverridesFile): string {
  return JSON.stringify(ModelOverridesFileSchema.parse(value), null, 2);
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
