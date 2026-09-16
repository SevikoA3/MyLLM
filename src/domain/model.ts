export type CapabilityState = 'supported' | 'unsupported' | 'unknown';

export type InputModality = 'text' | 'image' | 'file' | 'video';

export type ModelCapabilities = {
  streaming: CapabilityState;
  tools: CapabilityState;
  structuredOutput: CapabilityState;
  nativeCompaction: CapabilityState;
};

// Field yang tidak dikirim provider bernilai null, bukan false atau nol.
export type ModelRecord = {
  id: string;
  displayName: string;
  vendor: string | null;
  ownedBy: string | null;
  description: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  reasoningEfforts: string[];
  inputModalities: InputModality[];
  capabilities: ModelCapabilities;
  raw: Record<string, unknown>;
};

export const UNKNOWN_CAPABILITIES: ModelCapabilities = {
  streaming: 'unknown',
  tools: 'unknown',
  structuredOutput: 'unknown',
  nativeCompaction: 'unknown',
};
