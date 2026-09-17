import type { MergedModel } from './catalog-merge';
import type { EndpointProfile } from './endpoint';

export type ModelRequestSnapshot = {
  modelId: string;
  reasoningEffort: string | null;
  outputLimit: number | null;
  effectiveMaxOutput: number | null;
};

export function effectiveMaxOutput(
  modelLimit: number | null,
  protocolCap: number | null,
): number | null {
  if (modelLimit === null) {
    return protocolCap;
  }
  if (protocolCap === null) {
    return modelLimit;
  }
  return Math.min(modelLimit, protocolCap);
}

/** Provider order stays intact. Auto is an app choice when provider omits it. */
export function reasoningChoices(efforts: string[]): string[] {
  if (!efforts.some((effort) => effort !== 'auto')) {
    return [];
  }
  return efforts.includes('auto') ? [...efforts] : ['auto', ...efforts];
}

export function protocolOutputCap(profile: EndpointProfile): number | null {
  return profile.protocol === 'chat-completions' ? profile.compat.chatOutputCap : null;
}

export function modelRequestSnapshot(
  model: MergedModel,
  profile: EndpointProfile,
): ModelRequestSnapshot {
  const ceiling = effectiveMaxOutput(model.maxOutputTokens, protocolOutputCap(profile));
  const effort = model.request.reasoningEffort ?? 'auto';
  if (effort !== null && effort !== 'auto' && !model.reasoningEfforts.includes(effort)) {
    throw new Error(`Reasoning effort ${effort} tidak tersedia untuk ${model.id}.`);
  }
  const outputLimit = model.request.outputLimit;
  if (outputLimit !== null && ceiling !== null && outputLimit > ceiling) {
    throw new Error(`Output limit melebihi batas efektif ${String(ceiling)}.`);
  }
  return {
    modelId: model.id,
    reasoningEffort: effort,
    outputLimit,
    effectiveMaxOutput: ceiling,
  };
}
