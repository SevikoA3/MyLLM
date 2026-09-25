import * as z from 'zod';

import { createAppError, type AppError } from './error';
import { UNKNOWN_CAPABILITIES, type InputModality, type ModelRecord } from './model';

/**
 * Hanya bentuk envelope yang divalidasi di sini. Elemen data sengaja dibiarkan
 * loose supaya record rusak ditolak per record, bukan menggagalkan seluruh list.
 */
export const OpenAiModelListSchema = z.object({
  data: z.array(z.unknown()),
});

// Field yang sudah terverifikasi pada katalog AmanAI.
export const EnrichedModelFieldsSchema = z.object({
  owned_by: z.string().optional(),
  vendor: z.string().optional(),
  description: z.string().optional(),
  context_length: z.number().int().positive().optional(),
  context_window: z.number().int().positive().optional(),
  max_output: z.number().int().positive().optional(),
  thinking: z.array(z.string()).optional(),
  input_modalities: z.array(z.string()).optional(),
});

const MODALITIES: readonly string[] = ['text', 'image', 'file', 'video'];

export type ModelParseResult =
  | { ok: true; models: ModelRecord[]; rejected: string[] }
  | { ok: false; error: AppError };

export function parseModelList(body: string, safeDetails: Record<string, string> = {}): ModelParseResult {
  const invalidJson = (): ModelParseResult => ({
    ok: false,
    error: createAppError({
      category: 'schema',
      message: 'The model list response is not valid JSON.',
      httpStatus: null,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails,
    }),
  });

  const incompatible = (): ModelParseResult => ({
    ok: false,
    error: createAppError({
      category: 'schema',
      message: 'The model list schema is incompatible. The endpoint did not return the OpenAI { data: [...] } shape.',
      httpStatus: null,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails,
    }),
  });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return invalidJson();
  }
  const parsed = OpenAiModelListSchema.safeParse(payload);
  if (!parsed.success) {
    return incompatible();
  }

  const models: ModelRecord[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.data.data) {
    const record = normalizeModelRecord(entry);
    if (record === null) {
      rejected.push('record tanpa id valid');
      continue;
    }
    if (seen.has(record.id)) {
      rejected.push(`duplicate id ${record.id}`);
      continue;
    }
    seen.add(record.id);
    models.push(record);
  }

  if (models.length === 0) {
    return {
      ok: false,
      error: createAppError({
        category: 'model',
      message: 'The endpoint did not return a model with a valid ID.',
        httpStatus: null,
        providerCode: null,
        requestId: null,
        retryable: false,
        safeDetails,
      }),
    };
  }

  return { ok: true, models, rejected };
}

export function normalizeModelRecord(entry: unknown): ModelRecord | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const raw = { ...(entry as Record<string, unknown>) };
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id.length === 0) {
    return null;
  }
  const fields = readEnrichedFields(raw);
  const ownedBy = fields.owned_by ?? null;

  return {
    id,
    displayName: id,
    vendor: fields.vendor ?? inferVendor(id, ownedBy),
    ownedBy,
    description: fields.description ?? null,
    contextWindow: fields.context_length ?? fields.context_window ?? null,
    maxOutputTokens: fields.max_output ?? null,
    reasoningEfforts: fields.thinking ?? [],
    inputModalities: normalizeModalities(fields.input_modalities),
    capabilities: { ...UNKNOWN_CAPABILITIES },
    raw,
  };
}

/**
 * Field enriched dibaca satu per satu: satu field yang salah tipe tidak boleh
 * menggagalkan field lain pada record yang sama.
 */
function readEnrichedFields(raw: Record<string, unknown>): z.infer<typeof EnrichedModelFieldsSchema> {
  return {
    owned_by: typeof raw.owned_by === 'string' ? raw.owned_by : undefined,
    vendor: typeof raw.vendor === 'string' ? raw.vendor : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    context_length: positiveInteger(raw.context_length),
    context_window: positiveInteger(raw.context_window),
    max_output: positiveInteger(raw.max_output),
    thinking: stringArray(raw.thinking),
    input_modalities: stringArray(raw.input_modalities),
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

function normalizeModalities(values: string[] | undefined): InputModality[] {
  if (values === undefined) {
    return [];
  }
  const unique: InputModality[] = [];
  for (const value of values) {
    if (MODALITIES.includes(value) && !unique.includes(value as InputModality)) {
      unique.push(value as InputModality);
    }
  }
  return unique;
}

/** Prefix id sebelum slash bisa dipakai sebagai indikasi vendor, bukan fakta. */
function inferVendor(id: string, ownedBy: string | null): string | null {
  const separator = id.indexOf('/');
  if (separator > 0) {
    return id.slice(0, separator);
  }
  return ownedBy;
}
