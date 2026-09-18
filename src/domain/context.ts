import type { ConversationInputMessage } from './conversation';
import * as z from 'zod';

export const APP_AUTO_OUTPUT_BUDGET = 4096;
export const CONTEXT_TOKEN_BYTES_DIVISOR = 3;
export const CONTEXT_ITEM_OVERHEAD_TOKENS = 4;
export const CONTEXT_MIN_SAFETY_MARGIN = 1024;
export const CONTEXT_MAX_SAFETY_MARGIN = 8192;

export const ContextPolicySchema = z
  .object({
    autoCompact: z.boolean(),
    triggerPercent: z.number().int().min(1).max(99),
    targetPercent: z.number().int().min(1).max(98),
    hardStopPercent: z.number().int().min(2).max(100),
    minimumRecentTurns: z.number().int().min(1).max(100),
  })
  .superRefine((value, context) => {
    if (!(value.targetPercent < value.triggerPercent && value.triggerPercent < value.hardStopPercent)) {
      context.addIssue({
        code: 'custom',
        path: ['targetPercent'],
        message: 'Context policy harus memenuhi target < trigger < hard stop.',
      });
    }
  });
export type ContextPolicy = z.infer<typeof ContextPolicySchema>;

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = {
  autoCompact: true,
  triggerPercent: 80,
  targetPercent: 55,
  hardStopPercent: 95,
  minimumRecentTurns: 4,
};

export type ContextBudgetInput = {
  contextWindow: number | null;
  instructions: string;
  input: ConversationInputMessage[];
  outputLimit: number | null;
  effectiveMaxOutput: number | null;
  providerInputTokens?: number | null;
};

export type ContextBudgetResult = {
  contextWindow: number | null;
  inputTokensEstimate: number;
  requestedOutputReserve: number;
  safetyMargin: number | null;
  prospectiveUsed: number | null;
  remainingTokens: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  calibrationInputTokens: number | null;
  calibrationDeltaTokens: number | null;
  quality: 'estimated' | 'unknown';
};

export function buildContextBudget(input: ContextBudgetInput): ContextBudgetResult {
  const contextWindow = positiveInteger(input.contextWindow) ? input.contextWindow : null;
  const inputTokensEstimate = estimateInputTokens(input.instructions, input.input);
  const requested = input.outputLimit ?? APP_AUTO_OUTPUT_BUDGET;
  const requestedOutputReserve =
    input.effectiveMaxOutput === null
      ? requested
      : Math.min(requested, input.effectiveMaxOutput);
  const calibrationInputTokens = nonNegativeInteger(input.providerInputTokens)
    ? input.providerInputTokens
    : null;
  const calibrationDeltaTokens =
    calibrationInputTokens === null ? null : calibrationInputTokens - inputTokensEstimate;

  if (contextWindow === null) {
    return {
      contextWindow: null,
      inputTokensEstimate,
      requestedOutputReserve,
      safetyMargin: null,
      prospectiveUsed: null,
      remainingTokens: null,
      usedPercent: null,
      remainingPercent: null,
      calibrationInputTokens,
      calibrationDeltaTokens,
      quality: 'unknown',
    };
  }

  const safetyMargin = Math.max(
    CONTEXT_MIN_SAFETY_MARGIN,
    Math.min(CONTEXT_MAX_SAFETY_MARGIN, Math.floor(contextWindow * 0.02)),
  );
  const prospectiveUsed = inputTokensEstimate + requestedOutputReserve + safetyMargin;
  const usedPercent = clampPercent((prospectiveUsed / contextWindow) * 100);
  return {
    contextWindow,
    inputTokensEstimate,
    requestedOutputReserve,
    safetyMargin,
    prospectiveUsed,
    remainingTokens: Math.max(contextWindow - prospectiveUsed, 0),
    usedPercent,
    remainingPercent: 100 - usedPercent,
    calibrationInputTokens,
    calibrationDeltaTokens,
    quality: 'estimated',
  };
}

export function contextPolicy(value: unknown): ContextPolicy {
  return ContextPolicySchema.parse(value);
}

function estimateInputTokens(
  instructions: string,
  input: ConversationInputMessage[],
): number {
  const serialized = JSON.stringify({ instructions, input });
  const bytes = new TextEncoder().encode(serialized).byteLength;
  const itemCount = input.length + (instructions.length > 0 ? 1 : 0);
  return Math.ceil(bytes / CONTEXT_TOKEN_BYTES_DIVISOR) + itemCount * CONTEXT_ITEM_OVERHEAD_TOKENS;
}

function positiveInteger(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isInteger(value) && value >= 0;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
