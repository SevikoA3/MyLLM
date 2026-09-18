import {
  buildCompactedContext,
  buildCompactionPrompt,
  parseCompactionSummary,
  selectCompactionPrefix,
  COMPACTION_PROMPT_VERSION,
  type CompactionSummary,
} from '../../domain/compaction';
import { APP_AUTO_OUTPUT_BUDGET, buildContextBudget } from '../../domain/context';
import type { EndpointProfile } from '../../domain/endpoint';
import { buildSystemPrompt } from '../../domain/system-prompt';
import { conversationRepository } from '../persistence/conversation-store';
import {
  responsesClient,
  type SendResponseInput,
  type SendResponseOptions,
} from '../transport/responses';

const MAX_COMPACTION_ATTEMPTS = 2;

type CompactionRepository = Pick<
  typeof conversationRepository,
  | 'loadCompactionSource'
  | 'beginCompaction'
  | 'completeCompaction'
  | 'failCompaction'
>;

type CompactionClient = Pick<typeof responsesClient, 'send'>;

export type LocalCompactionInput = {
  profile: EndpointProfile;
  apiKey: string;
  conversationId: string;
  modelId: string;
  contextWindow: number | null;
  effectiveMaxOutput: number | null;
  reasoningEffort: string | null;
  minimumRecentTurns: number;
  beforeEstimate: number;
  repository?: CompactionRepository;
  client?: CompactionClient;
  signal?: AbortSignal;
};

export type LocalCompactionResult =
  | {
      ok: true;
      summary: CompactionSummary;
      afterEstimate: number;
    }
  | {
      ok: false;
      reason: 'no-prefix' | 'busy' | 'failed';
      message: string;
    };

export async function runLocalCompaction(
  input: LocalCompactionInput,
): Promise<LocalCompactionResult> {
  const repository = input.repository ?? conversationRepository;
  const client = input.client ?? responsesClient;
  const source = await repository.loadCompactionSource(input.conversationId);
  const selection = selectCompactionPrefix(source.turns, {
    minimumRecentTurns: input.minimumRecentTurns,
  });
  if (selection === null) {
    return {
      ok: false,
      reason: 'no-prefix',
      message: 'Belum ada prefix lengkap yang aman untuk di-compact.',
    };
  }

  let attempt = 0;
  while (attempt < MAX_COMPACTION_ATTEMPTS) {
    const id = await repository.beginCompaction({
      conversationId: input.conversationId,
      sourceStartTurnId: selection.source[0]?.turnId ?? '',
      sourceEndTurnId: selection.source.at(-1)?.turnId ?? '',
      sourceStartOrdinal: selection.source[0]?.ordinal ?? 0,
      sourceEndOrdinal: selection.source.at(-1)?.ordinal ?? 0,
      modelId: input.modelId,
      promptVersion: COMPACTION_PROMPT_VERSION,
      beforeEstimate: input.beforeEstimate,
    });
    if (id === null) {
      return {
        ok: false,
        reason: 'busy',
        message: 'Compaction lain sedang berjalan.',
      };
    }

    const result = await sendSummary(
      input,
      client,
      buildCompactionPrompt(selection.source, source.previousSummary),
    );
    const text = result.ok ? result.response.text : null;
    if (!result.ok || text === null || text.trim().length === 0) {
      await repository.failCompaction(id);
      if ((result.ok || !result.hadModelEvent) && attempt === 0) {
        attempt += 1;
        continue;
      }
      return {
        ok: false,
        reason: 'failed',
        message: result.ok ? 'Summary compaction kosong.' : result.error.message,
      };
    }
    const parsed = parseCompactionSummary(text);
    if (!parsed.ok) {
      await repository.failCompaction(id);
      return { ok: false, reason: 'failed', message: parsed.message };
    }

    const recent = selection.recent.flatMap((turn) => [
      { role: 'user' as const, content: turn.userText },
      { role: 'assistant' as const, content: turn.assistantText },
    ]);
    const after = buildContextBudget({
      contextWindow: input.contextWindow,
      instructions: buildSystemPrompt(input.modelId),
      input: buildCompactedContext(parsed.value, recent),
      outputLimit: null,
      effectiveMaxOutput: input.effectiveMaxOutput,
    });
    await repository.completeCompaction({
      id,
      summary: parsed.value,
      usage: result.response.usage,
      afterEstimate: after.prospectiveUsed ?? after.inputTokensEstimate,
    });
    return {
      ok: true,
      summary: parsed.value,
      afterEstimate: after.prospectiveUsed ?? after.inputTokensEstimate,
    };
  }
  return { ok: false, reason: 'failed', message: 'Compaction gagal setelah retry.' };
}

async function sendSummary(
  input: LocalCompactionInput,
  client: CompactionClient,
  prompt: string,
) {
  const outputLimit =
    input.effectiveMaxOutput === null
      ? APP_AUTO_OUTPUT_BUDGET
      : Math.min(APP_AUTO_OUTPUT_BUDGET, input.effectiveMaxOutput);
  const request: SendResponseInput = {
    modelId: input.modelId,
    prompt,
    history: [{ role: 'user', content: prompt }],
    previousResponseId: null,
    promptCacheKey: null,
    maxOutputTokens: outputLimit,
    reasoningEffort: input.reasoningEffort,
  };
  const options: SendResponseOptions = { signal: input.signal };
  return client.send(input.profile, input.apiKey, request, options);
}
