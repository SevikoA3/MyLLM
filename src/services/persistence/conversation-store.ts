import type { SQLiteDatabase } from 'expo-sqlite';

import {
  titleFromPrompt,
  type ChatMessage,
  type ConversationInputMessage,
  type ConversationCursor,
  type ConversationSummary,
  type TurnStatus,
} from '../../domain/conversation';
import {
  buildCompactedContext,
  parseCompactionSummary,
  type CompactionSummary,
  type CompactionTurn,
} from '../../domain/compaction';
import {
  toolError,
  type ToolActivity,
  type ToolApprovalStatus,
  type ToolCallStatus,
  type ToolCallUpdate,
  type ToolResult,
  type StoredToolCall,
} from '../../domain/tool';
import { buildTurnMetrics, normalizeUsage, type TurnMetrics } from '../../domain/usage';
import type { StreamTiming } from '../transport/responses';

const DATABASE_NAME = 'myllm.db';

type StartTurnInput = {
  conversationId: string | null;
  turnId: string;
  userItemId: string;
  assistantItemId: string;
  prompt: string;
  endpointId: string;
  modelId: string;
  previousResponseId: string | null;
  reasoningSetting: string | null;
  outputCeiling: number | null;
  autoCompact: boolean;
};

type FinishTurnInput = {
  turnId: string;
  assistantItemId: string;
  status: Exclude<TurnStatus, 'sending' | 'streaming'>;
  text: string;
  reasoningSummary: string | null;
  responseId: string | null;
  usage: Record<string, unknown> | null;
  timing: StreamTiming | null;
};

type ConversationRow = {
  id: string;
  title: string;
  updated_at: number;
  endpoint_id: string;
  active_model_id: string;
  auto_compact: number;
  active_compaction_id: string | null;
};

export type CompactionSource = {
  previousSummary: CompactionSummary | null;
  turns: CompactionTurn[];
};

export type BeginCompactionInput = {
  conversationId: string;
  sourceStartTurnId: string;
  sourceEndTurnId: string;
  sourceStartOrdinal: number;
  sourceEndOrdinal: number;
  modelId: string;
  promptVersion: number;
  beforeEstimate: number;
};

export type CompleteCompactionInput = {
  id: string;
  summary: CompactionSummary;
  usage: Record<string, unknown> | null;
  afterEstimate: number;
};

type ItemRow = {
  id: string;
  role: ChatMessage['role'];
  status: TurnStatus;
  content_json: string;
  turn_id: string;
};

type InputItemRow = Pick<ItemRow, 'role' | 'status' | 'content_json'>;

type TurnRow = {
  id: string;
  status: TurnStatus;
  response_id: string | null;
  content_json: string | null;
};

type SummaryRow = ConversationRow & { status: TurnStatus | null };

type MetricRow = {
  turn_id: string;
  ordinal: number;
  model_id: string;
  raw_json: string | null;
  request_start: number | null;
  first_event: number | null;
  first_visible_token: number | null;
  completed: number | null;
};

type CompactionRow = {
  id: string;
  summary_json: string | null;
  source_end_ordinal: number;
  status: 'running' | 'active' | 'failed' | 'interrupted';
};

type CompactionTurnRow = {
  turn_id: string;
  ordinal: number;
  user_content_json: string;
  assistant_content_json: string | null;
  assistant_status: TurnStatus | null;
};

type ToolCallRow = {
  id: string;
  turn_id: string;
  call_id: string;
  name: string;
  arguments_json: string;
  target: string;
  side_effect: string;
  status: ToolCallStatus;
  approval: ToolApprovalStatus;
  result_json: string | null;
};

async function nativeDatabase(): Promise<SQLiteDatabase> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  return openDatabaseAsync(DATABASE_NAME);
}

async function nativeDeleteDatabase(): Promise<void> {
  const { deleteDatabaseAsync } = await import('expo-sqlite');
  await deleteDatabaseAsync(DATABASE_NAME);
}

export function createConversationRepository(
  resolveDatabase: () => Promise<SQLiteDatabase> = nativeDatabase,
  now: () => number = Date.now,
  deleteDatabase: () => Promise<void> = nativeDeleteDatabase,
) {
  let databasePromise: Promise<SQLiteDatabase> | null = null;
  let initialized: Promise<void> | null = null;

  async function database(): Promise<SQLiteDatabase> {
    databasePromise ??= resolveDatabase();
    return databasePromise;
  }

  async function initialize(): Promise<void> {
    initialized ??= migrateAndRecover();
    return initialized;
  }

  async function clear(): Promise<void> {
    if (databasePromise !== null) {
      await (await databasePromise).closeAsync();
    }
    await deleteDatabase();
    databasePromise = null;
    initialized = null;
  }

  async function migrateAndRecover(): Promise<void> {
    const db = await database();
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 3) {
      throw new Error('The conversation database was created by a newer app version.');
    }
    if ((version?.user_version ?? 0) === 0) {
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(MIGRATION_V1);
        await transaction.execAsync('PRAGMA user_version = 1');
      });
    }
    if ((version?.user_version ?? 0) < 2) {
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(MIGRATION_V2);
        await transaction.execAsync('PRAGMA user_version = 2');
      });
    }
    if ((version?.user_version ?? 0) < 3) {
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(MIGRATION_V3);
        await transaction.execAsync('PRAGMA user_version = 3');
      });
    }
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `UPDATE turns SET status = 'interrupted', completed_at = ?
         WHERE status IN ('sending', 'streaming')`,
        [now()],
      );
      await transaction.runAsync(
        `UPDATE items SET status = 'interrupted', updated_at = ?
         WHERE role = 'assistant' AND status IN ('sending', 'streaming')`,
        [now()],
      );
      await transaction.runAsync(
        `UPDATE compactions SET status = 'interrupted' WHERE status = 'running'`,
      );
      await transaction.runAsync(
        `UPDATE tool_calls SET status = 'interrupted', updated_at = ?
         WHERE status IN ('awaiting_approval', 'executing')`,
        [now()],
      );
    });
  }

  async function startTurn(input: StartTurnInput): Promise<{ conversationId: string }> {
    await initialize();
    const db = await database();
    const timestamp = now();
    let conversationId = input.conversationId ?? newId('conv', timestamp);
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const existing =
        input.conversationId === null
          ? null
          : await transaction.getFirstAsync<{ id: string }>(
              'SELECT id FROM conversations WHERE id = ?',
              [input.conversationId],
            );
      if (existing === null) {
        if (input.conversationId !== null) {
          conversationId = newId('conv', timestamp);
        }
        await transaction.runAsync(
          `INSERT INTO conversations
           (id, title, created_at, updated_at, endpoint_id, active_model_id, auto_compact)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            conversationId,
            titleFromPrompt(input.prompt),
            timestamp,
            timestamp,
            input.endpointId,
            input.modelId,
            input.autoCompact ? 1 : 0,
          ],
        );
      } else {
        await transaction.runAsync(
          `UPDATE conversations SET updated_at = ?, active_model_id = ?, auto_compact = ? WHERE id = ?`,
          [timestamp, input.modelId, input.autoCompact ? 1 : 0, conversationId],
        );
      }
      const ordinal = await transaction.getFirstAsync<{ value: number }>(
        'SELECT COALESCE(MAX(ordinal), 0) + 1 AS value FROM turns WHERE conversation_id = ?',
        [conversationId],
      );
      await transaction.runAsync(
        `INSERT INTO turns
         (id, conversation_id, ordinal, status, endpoint_id, model_id, reasoning_setting,
          output_ceiling, previous_response_id, response_id, started_at, completed_at)
         VALUES (?, ?, ?, 'sending', ?, ?, ?, ?, ?, NULL, ?, NULL)`,
        [
          input.turnId,
          conversationId,
          ordinal?.value ?? 1,
          input.endpointId,
          input.modelId,
          input.reasoningSetting,
          input.outputCeiling,
          input.previousResponseId,
          timestamp,
        ],
      );
      await transaction.runAsync(
        `INSERT INTO items
         (id, turn_id, type, role, status, content_json, provider_item_id, phase, created_at, updated_at)
         VALUES (?, ?, 'message', 'user', 'completed', ?, NULL, NULL, ?, ?)`,
        [input.userItemId, input.turnId, contentJson(input.prompt, null), timestamp, timestamp],
      );
      await transaction.runAsync(
        `INSERT INTO items
         (id, turn_id, type, role, status, content_json, provider_item_id, phase, created_at, updated_at)
         VALUES (?, ?, 'message', 'assistant', 'sending', ?, NULL, NULL, ?, ?)`,
        [input.assistantItemId, input.turnId, contentJson('', null), timestamp, timestamp],
      );
      await transaction.runAsync('INSERT INTO usage (turn_id, raw_json) VALUES (?, NULL)', [
        input.turnId,
      ]);
      await transaction.runAsync(
        `INSERT INTO timing
         (turn_id, request_start, first_event, first_visible_token, completed)
         VALUES (?, NULL, NULL, NULL, NULL)`,
        [input.turnId],
      );
    });
    return { conversationId };
  }

  async function restartTurn(turnId: string, assistantItemId: string): Promise<void> {
    await initialize();
    const db = await database();
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const timestamp = now();
      await transaction.runAsync(
        `UPDATE turns SET status = 'sending', response_id = NULL, started_at = ?, completed_at = NULL
         WHERE id = ?`,
        [timestamp, turnId],
      );
      await transaction.runAsync(
        `UPDATE items SET status = 'sending', content_json = ?, updated_at = ? WHERE id = ?`,
        [contentJson('', null), timestamp, assistantItemId],
      );
      await transaction.runAsync(
        `UPDATE timing SET request_start = NULL, first_event = NULL, first_visible_token = NULL,
         completed = NULL WHERE turn_id = ?`,
        [turnId],
      );
      await transaction.runAsync('UPDATE usage SET raw_json = NULL WHERE turn_id = ?', [turnId]);
    });
  }

  async function flushAssistant(
    turnId: string,
    assistantItemId: string,
    text: string,
    reasoningSummary: string | null,
  ): Promise<void> {
    await initialize();
    const db = await database();
    const timestamp = now();
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `UPDATE items SET status = 'streaming', content_json = ?, updated_at = ? WHERE id = ?`,
        [contentJson(text, reasoningSummary), timestamp, assistantItemId],
      );
      await transaction.runAsync(`UPDATE turns SET status = 'streaming' WHERE id = ?`, [turnId]);
      await transaction.runAsync(
        `UPDATE conversations SET updated_at = ?
         WHERE id = (SELECT conversation_id FROM turns WHERE id = ?)`,
        [timestamp, turnId],
      );
    });
  }

  async function finishTurn(input: FinishTurnInput): Promise<void> {
    await initialize();
    const db = await database();
    const timestamp = now();
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `UPDATE items SET status = ?, content_json = ?, updated_at = ? WHERE id = ?`,
        [
          input.status,
          contentJson(input.text, input.reasoningSummary),
          timestamp,
          input.assistantItemId,
        ],
      );
      await transaction.runAsync(
        `UPDATE turns SET status = ?, response_id = ?, completed_at = ? WHERE id = ?`,
        [input.status, input.responseId, timestamp, input.turnId],
      );
      await transaction.runAsync('UPDATE usage SET raw_json = ? WHERE turn_id = ?', [
        input.usage === null ? null : JSON.stringify(input.usage),
        input.turnId,
      ]);
      await transaction.runAsync(
        `UPDATE timing SET request_start = ?, first_event = ?, first_visible_token = ?, completed = ?
         WHERE turn_id = ?`,
        [
          input.timing?.requestStart ?? null,
          input.timing?.firstEvent ?? null,
          input.timing?.firstVisibleToken ?? null,
          input.timing?.completed ?? null,
          input.turnId,
        ],
      );
      await transaction.runAsync(
        `UPDATE conversations SET updated_at = ?
         WHERE id = (SELECT conversation_id FROM turns WHERE id = ?)`,
        [timestamp, input.turnId],
      );
    });
  }

  async function recordToolCall(input: StoredToolCall): Promise<ToolActivity> {
    await initialize();
    const db = await database();
    let saved: ToolActivity | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const existing = await transaction.getFirstAsync<ToolCallRow>(
        `SELECT id, turn_id, call_id, name, arguments_json, target, side_effect, status, approval, result_json
         FROM tool_calls WHERE turn_id = ? AND call_id = ?`,
        [input.turnId, input.callId],
      );
      if (existing !== null) {
        saved = toolActivityFromRow(existing);
        return;
      }
      const timestamp = now();
      await transaction.runAsync(
        `INSERT INTO tool_calls
         (id, turn_id, call_id, name, arguments_json, target, side_effect, status, approval, result_json,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          input.id,
          input.turnId,
          input.callId,
          input.name,
          input.argumentsJson,
          input.target,
          input.sideEffect,
          input.status,
          input.approval,
          timestamp,
          timestamp,
        ],
      );
      saved = { ...input };
    });
    if (saved === null) {
      throw new Error('Tool call was not saved.');
    }
    return saved;
  }

  async function updateToolCall(input: ToolCallUpdate): Promise<ToolActivity> {
    await initialize();
    const db = await database();
    let saved: ToolActivity | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `UPDATE tool_calls SET status = ?, approval = ?, result_json = ?, updated_at = ? WHERE id = ?`,
        [
          input.status,
          input.approval,
          input.result === null ? null : JSON.stringify(input.result),
          now(),
          input.id,
        ],
      );
      const row = await transaction.getFirstAsync<ToolCallRow>(
        `SELECT id, turn_id, call_id, name, arguments_json, target, side_effect, status, approval, result_json
         FROM tool_calls WHERE id = ?`,
        [input.id],
      );
      if (row === null) {
        throw new Error('Tool call was not found.');
      }
      saved = toolActivityFromRow(row);
    });
    if (saved === null) {
      throw new Error('Tool call was not updated.');
    }
    return saved;
  }

  async function loadConversation(id: string): Promise<{
    id: string;
    title: string;
    messages: ChatMessage[];
    previousResponseId: string | null;
    previousResponseModelId: string | null;
    retry: { turnId: string; assistantItemId: string; prompt: string } | null;
    metrics: TurnMetrics[];
    autoCompact: boolean;
    compactionActive: boolean;
  } | null> {
    await initialize();
    const db = await database();
    const conversation = await db.getFirstAsync<ConversationRow>(
      'SELECT * FROM conversations WHERE id = ?',
      [id],
    );
    if (conversation === null) {
      return null;
    }
    const rows = await db.getAllAsync<ItemRow>(
      `SELECT i.id, i.role, i.status, i.content_json, i.turn_id
       FROM items i JOIN turns t ON t.id = i.turn_id
       WHERE t.conversation_id = ?
       ORDER BY t.ordinal ASC, CASE i.role WHEN 'user' THEN 0 ELSE 1 END`,
      [id],
    );
    const previous = await db.getFirstAsync<{ response_id: string; model_id: string }>(
      `SELECT response_id, model_id FROM turns
       WHERE conversation_id = ? AND status = 'completed' AND response_id IS NOT NULL
       ORDER BY ordinal DESC LIMIT 1`,
      [id],
    );
    const last = await db.getFirstAsync<TurnRow>(
      `SELECT t.id, t.status, t.response_id, user.content_json
       FROM turns t
       LEFT JOIN items user ON user.turn_id = t.id AND user.role = 'user'
       WHERE t.conversation_id = ? ORDER BY t.ordinal DESC LIMIT 1`,
      [id],
    );
    const assistant = last === null
      ? null
      : rows.find((row) => row.turn_id === last.id && row.role === 'assistant') ?? null;
    return {
      id: conversation.id,
      title: conversation.title,
      messages: rows.map(messageFromRow),
      autoCompact: conversation.auto_compact !== 0,
      compactionActive: conversation.active_compaction_id !== null,
      previousResponseId: previous?.response_id ?? null,
      previousResponseModelId: previous?.model_id ?? null,
      metrics: await loadTurnMetrics(conversation.id),
      retry:
        last !== null && last.status !== 'completed' && assistant !== null
          ? {
              turnId: last.id,
              assistantItemId: assistant.id,
              prompt: parseContent(last.content_json).text,
            }
          : null,
    };
  }

  async function loadLatest(endpointId: string) {
    await initialize();
    const db = await database();
    const latest = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM conversations WHERE endpoint_id = ?
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [endpointId],
    );
    return latest === null ? null : loadConversation(latest.id);
  }

  async function loadRequestHistory(conversationId: string): Promise<ConversationInputMessage[]> {
    await initialize();
    const db = await database();
    const conversation = await db.getFirstAsync<ConversationRow>(
      'SELECT * FROM conversations WHERE id = ?',
      [conversationId],
    );
    if (conversation === null) {
      return [];
    }
    const active = await activeCompaction(db, conversation.active_compaction_id);
    const summary = parseActiveSummary(active);
    const rows = await db.getAllAsync<InputItemRow>(
      `SELECT i.role, i.status, i.content_json
       FROM items i JOIN turns t ON t.id = i.turn_id
       WHERE t.conversation_id = ?
         AND t.ordinal > ?
         AND (i.role = 'user' OR (i.role = 'assistant' AND i.status = 'completed'))
       ORDER BY t.ordinal ASC, CASE i.role WHEN 'user' THEN 0 ELSE 1 END`,
      [conversationId, active?.source_end_ordinal ?? 0],
    );
    const recent = rows.flatMap((row) => {
      if (row.role === null) {
        return [];
      }
      const text = parseContent(row.content_json).text;
      return text.length === 0 ? [] : [{ role: row.role, content: text }];
    });
    return summary === null ? recent : buildCompactedContext(summary, recent);
  }

  async function loadCompactionSource(conversationId: string): Promise<CompactionSource> {
    await initialize();
    const db = await database();
    const conversation = await db.getFirstAsync<ConversationRow>(
      'SELECT * FROM conversations WHERE id = ?',
      [conversationId],
    );
    if (conversation === null) {
      return { previousSummary: null, turns: [] };
    }
    const active = await activeCompaction(db, conversation.active_compaction_id);
    const previousSummary = parseActiveSummary(active);
    const rows = await db.getAllAsync<CompactionTurnRow>(
      `SELECT t.id AS turn_id, t.ordinal,
              user.content_json AS user_content_json,
              assistant.content_json AS assistant_content_json,
              assistant.status AS assistant_status
       FROM turns t
       JOIN items user ON user.turn_id = t.id AND user.role = 'user'
       JOIN items assistant ON assistant.turn_id = t.id AND assistant.role = 'assistant'
       WHERE t.conversation_id = ? AND t.ordinal > ?
         AND t.status = 'completed' AND assistant.status = 'completed'
       ORDER BY t.ordinal ASC`,
      [conversationId, active?.source_end_ordinal ?? 0],
    );
    return {
      previousSummary,
      turns: rows.map((row) => ({
        turnId: row.turn_id,
        ordinal: row.ordinal,
        userText: parseContent(row.user_content_json).text,
        assistantText: parseContent(row.assistant_content_json).text,
      })),
    };
  }

  async function setAutoCompact(conversationId: string, enabled: boolean): Promise<void> {
    await initialize();
    await (await database()).runAsync(
      'UPDATE conversations SET auto_compact = ?, updated_at = ? WHERE id = ?',
      [enabled ? 1 : 0, now(), conversationId],
    );
  }

  async function beginCompaction(input: BeginCompactionInput): Promise<string | null> {
    await initialize();
    const db = await database();
    const timestamp = now();
    let id: string | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const running = await transaction.getFirstAsync<{ id: string }>(
        `SELECT id FROM compactions WHERE conversation_id = ? AND status = 'running' LIMIT 1`,
        [input.conversationId],
      );
      if (running !== null) {
        return;
      }
      id = newId('compact', timestamp);
      await transaction.runAsync(
        `INSERT INTO compactions
         (id, conversation_id, method, source_start_turn_id, source_end_turn_id,
          source_start_ordinal, source_end_ordinal, model_id, prompt_version,
          input_tokens, output_tokens, before_estimate, after_estimate, usage_json,
          summary_json, created_at, completed_at, status)
         VALUES (?, ?, 'local', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, ?, NULL, 'running')`,
        [
          id,
          input.conversationId,
          input.sourceStartTurnId,
          input.sourceEndTurnId,
          input.sourceStartOrdinal,
          input.sourceEndOrdinal,
          input.modelId,
          input.promptVersion,
          input.beforeEstimate,
          timestamp,
        ],
      );
    });
    return id;
  }

  async function completeCompaction(input: CompleteCompactionInput): Promise<void> {
    await initialize();
    const db = await database();
    const timestamp = now();
    const usageJson = input.usage === null ? null : JSON.stringify(input.usage);
    const normalized = normalizeUsage(input.usage);
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const row = await transaction.getFirstAsync<{ conversation_id: string }>(
        `SELECT conversation_id FROM compactions WHERE id = ? AND status = 'running'`,
        [input.id],
      );
      if (row === null) {
        return;
      }
      await transaction.runAsync(
        `UPDATE compactions
         SET status = 'active', summary_json = ?, usage_json = ?, input_tokens = ?,
             output_tokens = ?, after_estimate = ?, completed_at = ?
         WHERE id = ?`,
        [
          JSON.stringify(input.summary),
          usageJson,
          normalized.inputTokens,
          normalized.outputTokens,
          input.afterEstimate,
          timestamp,
          input.id,
        ],
      );
      await transaction.runAsync(
        'UPDATE conversations SET active_compaction_id = ?, updated_at = ? WHERE id = ?',
        [input.id, timestamp, row.conversation_id],
      );
    });
  }

  async function failCompaction(id: string, status: 'failed' | 'interrupted' = 'failed'): Promise<void> {
    await initialize();
    await (await database()).runAsync(
      `UPDATE compactions SET status = ?, completed_at = ?
       WHERE id = ? AND status = 'running'`,
      [status, now(), id],
    );
  }

  async function loadTurnMetrics(conversationId: string): Promise<TurnMetrics[]> {
    await initialize();
    const db = await database();
    const rows = await db.getAllAsync<MetricRow>(
      `SELECT t.id AS turn_id, t.ordinal, t.model_id, u.raw_json,
              ti.request_start, ti.first_event, ti.first_visible_token, ti.completed
       FROM turns t
       LEFT JOIN usage u ON u.turn_id = t.id
       LEFT JOIN timing ti ON ti.turn_id = t.id
       WHERE t.conversation_id = ?
         AND t.status = 'completed'
       ORDER BY t.ordinal ASC`,
      [conversationId],
    );
    return rows.map((row) =>
      buildTurnMetrics(
        row.turn_id,
        row.ordinal,
        row.model_id,
        normalizeUsage(parseRawUsage(row.raw_json)),
        {
          requestStart: row.request_start,
          firstEvent: row.first_event,
          firstVisibleToken: row.first_visible_token,
          completed: row.completed,
        },
      ),
    );
  }

  async function list(
    limit: number,
    cursor: ConversationCursor | null = null,
  ): Promise<{ conversations: ConversationSummary[]; nextCursor: ConversationCursor | null }> {
    await initialize();
    const db = await database();
    const rows = await db.getAllAsync<SummaryRow>(
      `SELECT c.*, (SELECT t.status FROM turns t WHERE t.conversation_id = c.id
       ORDER BY t.ordinal DESC LIMIT 1) AS status
       FROM conversations c
       WHERE (? IS NULL OR c.updated_at < ? OR (c.updated_at = ? AND c.id < ?))
       ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`,
      [
        cursor?.updatedAt ?? null,
        cursor?.updatedAt ?? null,
        cursor?.updatedAt ?? null,
        cursor?.id ?? null,
        limit,
      ],
    );
    const conversations = rows.map(summaryFromRow);
    const last = conversations.at(-1);
    return {
      conversations,
      nextCursor:
        rows.length < limit || last === undefined
          ? null
          : { updatedAt: last.updatedAt, id: last.id },
    };
  }

  async function rename(id: string, title: string): Promise<void> {
    await initialize();
    await (await database()).runAsync(
      'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
      [title.trim(), now(), id],
    );
  }

  async function remove(id: string): Promise<void> {
    await initialize();
    await (await database()).runAsync('DELETE FROM conversations WHERE id = ?', [id]);
  }

  return {
    initialize,
    clear,
    startTurn,
    restartTurn,
    flushAssistant,
    finishTurn,
    recordToolCall,
    updateToolCall,
    loadConversation,
    loadLatest,
    loadRequestHistory,
    loadCompactionSource,
    setAutoCompact,
    beginCompaction,
    completeCompaction,
    failCompaction,
    loadTurnMetrics,
    list,
    rename,
    remove,
  };
}

async function activeCompaction(
  database: SQLiteDatabase,
  id: string | null,
): Promise<CompactionRow | null> {
  return id === null
    ? null
    : database.getFirstAsync<CompactionRow>(
        `SELECT id, summary_json, source_end_ordinal, status
         FROM compactions WHERE id = ?`,
        [id],
      );
}

function parseActiveSummary(row: CompactionRow | null): CompactionSummary | null {
  if (row === null || row.status !== 'active') {
    return null;
  }
  if (row.summary_json === null) {
    throw new Error('The active compaction has no summary.');
  }
  const parsed = parseCompactionSummary(row.summary_json);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  return parsed.value;
}

function contentJson(text: string, reasoningSummary: string | null): string {
  return JSON.stringify({ text, reasoningSummary });
}

function parseContent(value: string | null): { text: string; reasoningSummary: string | null } {
  if (value === null) {
    return { text: '', reasoningSummary: null };
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return {
        text: typeof record.text === 'string' ? record.text : '',
        reasoningSummary:
          typeof record.reasoningSummary === 'string' ? record.reasoningSummary : null,
      };
    }
  } catch {
    // Invalid persisted content is rendered empty instead of crashing history.
  }
  return { text: '', reasoningSummary: null };
}

function parseRawUsage(value: string | null): unknown {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function toolActivityFromRow(row: ToolCallRow): ToolActivity {
  return {
    id: row.id,
    callId: row.call_id,
    name: row.name,
    argumentsJson: row.arguments_json,
    target: row.target,
    sideEffect: row.side_effect,
    status: row.status,
    approval: row.approval,
    result: parseToolResult(row.result_json, row.call_id),
  };
}

function parseToolResult(value: string | null, callId: string): ToolResult | null {
  if (value === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).callId === 'string' &&
      typeof (parsed as Record<string, unknown>).output === 'string' &&
      typeof (parsed as Record<string, unknown>).isError === 'boolean'
    ) {
      return parsed as ToolResult;
    }
  } catch {
    // Corrupt result must not reopen a completed call with side effects.
  }
  return toolError(callId, 'Stored tool result is invalid and will not be repeated.');
}

function messageFromRow(row: ItemRow): ChatMessage {
  const content = parseContent(row.content_json);
  return { id: row.id, role: row.role, status: row.status, ...content };
}

function summaryFromRow(row: SummaryRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    endpointId: row.endpoint_id,
    activeModelId: row.active_model_id,
    status: row.status,
  };
}

let idSequence = 0;
function newId(prefix: string, timestamp = Date.now()): string {
  idSequence += 1;
  return `${prefix}_${timestamp.toString(36)}_${idSequence.toString(36)}`;
}

const MIGRATION_V1 = `
CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  endpoint_id TEXT NOT NULL,
  active_model_id TEXT NOT NULL
);
CREATE INDEX conversations_updated ON conversations(updated_at DESC, id DESC);
CREATE TABLE turns (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sending','streaming','completed','failed','cancelled','interrupted')),
  endpoint_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  reasoning_setting TEXT,
  output_ceiling INTEGER,
  previous_response_id TEXT,
  response_id TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE(conversation_id, ordinal)
);
CREATE TABLE items (
  id TEXT PRIMARY KEY NOT NULL,
  turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  role TEXT CHECK(role IN ('user','assistant')),
  status TEXT NOT NULL CHECK(status IN ('sending','streaming','completed','failed','cancelled','interrupted')),
  content_json TEXT NOT NULL,
  provider_item_id TEXT,
  phase TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE usage (
  turn_id TEXT PRIMARY KEY NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  raw_json TEXT
);
CREATE TABLE timing (
  turn_id TEXT PRIMARY KEY NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  request_start REAL,
  first_event REAL,
  first_visible_token REAL,
  completed REAL
);
`;

const MIGRATION_V2 = `
ALTER TABLE conversations ADD COLUMN auto_compact INTEGER NOT NULL DEFAULT 1;
ALTER TABLE conversations ADD COLUMN active_compaction_id TEXT;
CREATE TABLE compactions (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK(method IN ('local')),
  source_start_turn_id TEXT NOT NULL,
  source_end_turn_id TEXT NOT NULL,
  source_start_ordinal INTEGER NOT NULL,
  source_end_ordinal INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  before_estimate INTEGER NOT NULL,
  after_estimate INTEGER,
  usage_json TEXT,
  summary_json TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL CHECK(status IN ('running','active','failed','interrupted'))
);
CREATE INDEX compactions_conversation ON compactions(conversation_id, source_end_ordinal);
CREATE UNIQUE INDEX compactions_running ON compactions(conversation_id) WHERE status = 'running';
`;

const MIGRATION_V3 = `
CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY NOT NULL,
  turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  target TEXT NOT NULL,
  side_effect TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('awaiting_approval','executing','completed','failed','rejected','timed_out','cancelled','interrupted')),
  approval TEXT NOT NULL CHECK(approval IN ('pending','approved','rejected','not_required')),
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(turn_id, call_id)
);
CREATE INDEX tool_calls_turn ON tool_calls(turn_id, created_at);
`;

export const conversationRepository = createConversationRepository();
