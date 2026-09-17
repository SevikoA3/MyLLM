import {
  pricingFromRaw,
  type CatalogModelFields,
  type HistoryModelEntry,
  type ModelOverride,
  type ModelRequestOverride,
  type Pricing,
} from './catalog';
import { UNKNOWN_CAPABILITIES, type ModelCapabilities, type ModelRecord } from './model';

export const CATALOG_SOURCES = ['bundled', 'live', 'user-override', 'history'] as const;
export type CatalogSource = (typeof CATALOG_SOURCES)[number];

export type ProvenanceMap = Record<
  string,
  { value: string | number | boolean | null; source: CatalogSource }
>;

export type MergedModel = ModelRecord & {
  pricing: Pricing | null;
  provenance: ProvenanceMap;
  request: { reasoningEffort: string | null; outputLimit: number | null };
  /** false hanya jika pengguna mematikan model ini; model orphan tetap true. */
  enabled: boolean;
  /** true jika model tidak ada di defaults dan tidak ada di snapshot live. */
  orphaned: boolean;
};

export type MergeInput = {
  defaults: CatalogModelFields[];
  live: CatalogModelFields[];
  overrides: Record<string, ModelOverride>;
  history?: HistoryModelEntry[];
};

/**
 * Precedence: bundled default, lalu snapshot live, lalu override pengguna.
 * Override yang hanya berisi null tidak menimpa apa pun; null menghapus override.
 */
export function mergeCatalog(input: MergeInput): MergedModel[] {
  const layers = new Map<string, Record<string, unknown>>();
  const inherited = new Map<string, Record<string, unknown>>();
  const bundled = new Set<string>();
  const live = new Set<string>();
  const provenance: Record<string, ProvenanceMap> = {};
  collect(layers, inherited, input.defaults, 'bundled', bundled, provenance);
  collect(layers, inherited, input.live, 'live', live, provenance);

  // Override diterapkan setelah kedua lapis lain supaya field null benar-benar
  // kembali inherit dan field array mengganti array upstream.
  for (const [id, override] of Object.entries(input.overrides)) {
    const fields = { ...layers.get(id) };
    const map = provenance[id] ?? (provenance[id] = {});
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined || key === 'disabledAt') {
        continue;
      }
      if (key === 'enabled') {
        if (typeof value === 'boolean') {
          map.enabled = { value, source: 'user-override' };
        } else {
          delete map.enabled;
        }
        continue;
      }
      if (key === 'request') {
        if (isRecord(value)) {
          for (const [requestKey, requestValue] of Object.entries(value)) {
            const path = `request.${requestKey}`;
            if (requestValue === null) {
              delete map[path];
            } else {
              map[path] = { value: scalar(requestValue), source: 'user-override' };
            }
          }
        }
        continue;
      }
      if (key === 'capabilities') {
        fields.capabilities = mergeCapabilities(
          fields.capabilities,
          inherited.get(id)?.capabilities,
          value,
          map,
        );
        continue;
      }
      if (value === null) {
        // null berarti kembali inherit, bukan menetapkan nilai kosong.
        const inheritedValue = inherited.get(id)?.[key];
        if (inheritedValue === undefined) {
          delete fields[key];
          delete map[key];
        } else {
          fields[key] = inheritedValue;
        }
        continue;
      }
      fields[key] = value;
      map[key] = { value: scalar(value), source: 'user-override' };
    }
    if (Object.keys(fields).length > 0) {
      layers.set(id, fields);
    } else {
      layers.delete(id);
    }
  }

  const history = new Map((input.history ?? []).map((entry) => [entry.id, entry]));
  for (const entry of history.values()) {
    if (!layers.has(entry.id)) {
      layers.set(entry.id, { displayName: entry.displayName });
    }
    provenance[entry.id] = {
      displayName: { value: entry.displayName, source: 'history' },
      ...provenance[entry.id],
    };
  }

  return [...layers.entries()].map(([id, fields]) =>
    toRecord(
      id,
      fields,
      provenance[id] ?? {},
      !bundled.has(id) && !live.has(id),
      input.overrides[id],
    ),
  );
}

function collect(
  layers: Map<string, Record<string, unknown>>,
  inherited: Map<string, Record<string, unknown>>,
  models: CatalogModelFields[],
  provenanceSource: CatalogSource,
  contains: Set<string>,
  provenance: Record<string, ProvenanceMap>,
): void {
  for (const model of models) {
    const current = layers.get(model.id) ?? {};
    const inherit = inherited.get(model.id) ?? {};
    const map = provenance[model.id] ?? (provenance[model.id] = {});
    for (const [key, value] of Object.entries(model)) {
      if (key === 'id' || value === undefined || value === null) {
        continue;
      }
      if (key === 'capabilities') {
        const next = { ...(isRecord(current.capabilities) ? current.capabilities : {}) };
        const inheritedNext = { ...(isRecord(inherit.capabilities) ? inherit.capabilities : {}) };
        for (const [capability, state] of Object.entries(value)) {
          if (state === undefined || state === null) {
            continue;
          }
          next[capability] = state;
          inheritedNext[capability] = state;
          map[`capabilities.${capability}`] = {
            value: scalar(state),
            source: provenanceSource,
          };
        }
        current.capabilities = next;
        inherit.capabilities = inheritedNext;
        continue;
      }
      current[key] = value;
      inherit[key] = value;
      map[key] = { value: scalar(value), source: provenanceSource };
    }
    layers.set(model.id, current);
    inherited.set(model.id, inherit);
    contains.add(model.id);
  }
}

function toRecord(
  id: string,
  fields: Record<string, unknown>,
  provenance: ProvenanceMap,
  orphaned: boolean,
  override: ModelOverride | undefined,
): MergedModel {
  const raw = isRecord(fields.raw) ? fields.raw : {};
  const ownedBy = typeof fields.ownedBy === 'string' ? fields.ownedBy : null;
  const capabilities = { ...UNKNOWN_CAPABILITIES };
  for (const key of Object.keys(UNKNOWN_CAPABILITIES) as (keyof ModelCapabilities)[]) {
    const state = fields.capabilities;
    if (isRecord(state) && typeof state[key] === 'string') {
      capabilities[key] = state[key] as CapabilityStateValue;
    }
    if (provenance[`capabilities.${key}`] === undefined && override?.capabilities?.[key]) {
      provenance[`capabilities.${key}`] = { value: capabilities[key], source: 'user-override' };
    }
  }

  const record: MergedModel = {
    id,
    displayName: typeof fields.displayName === 'string' ? fields.displayName : id,
    vendor: typeof fields.vendor === 'string' ? fields.vendor : inferVendor(id, ownedBy),
    ownedBy,
    description: typeof fields.description === 'string' ? fields.description : null,
    contextWindow: typeof fields.contextWindow === 'number' ? fields.contextWindow : null,
    maxOutputTokens: typeof fields.maxOutputTokens === 'number' ? fields.maxOutputTokens : null,
    reasoningEfforts: Array.isArray(fields.reasoningEfforts)
      ? fields.reasoningEfforts.filter((entry): entry is string => typeof entry === 'string')
      : [],
    inputModalities: Array.isArray(fields.inputModalities)
      ? (fields.inputModalities as ModelRecord['inputModalities'])
      : [],
    capabilities,
    raw,
    pricing: pricingFromRaw(raw),
    provenance,
    request: requestFromOverride(override?.request),
    enabled:
      typeof override?.enabled === 'boolean' ? override.enabled : override?.disabledAt == null,
    orphaned,
  };
  return record;
}

function mergeCapabilities(
  currentValue: unknown,
  inheritedValue: unknown,
  overrideValue: unknown,
  provenance: ProvenanceMap,
): Record<string, unknown> {
  const current = { ...(isRecord(currentValue) ? currentValue : {}) };
  const inherited = isRecord(inheritedValue) ? inheritedValue : {};
  if (!isRecord(overrideValue)) {
    return current;
  }
  for (const [key, value] of Object.entries(overrideValue)) {
    if (value === null) {
      if (inherited[key] === undefined) {
        delete current[key];
        delete provenance[`capabilities.${key}`];
      } else {
        current[key] = inherited[key];
      }
      continue;
    }
    current[key] = value;
    provenance[`capabilities.${key}`] = {
      value: scalar(value),
      source: 'user-override',
    };
  }
  return current;
}

function requestFromOverride(value: ModelRequestOverride | null | undefined): MergedModel['request'] {
  return {
    reasoningEffort: typeof value?.reasoningEffort === 'string' ? value.reasoningEffort : null,
    outputLimit: typeof value?.outputLimit === 'number' ? value.outputLimit : null,
  };
}

type CapabilityStateValue = ModelCapabilities[keyof ModelCapabilities];

function inferVendor(id: string, ownedBy: string | null): string | null {
  const separator = id.indexOf('/');
  if (separator > 0) {
    return id.slice(0, separator);
  }
  return ownedBy;
}

function scalar(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
