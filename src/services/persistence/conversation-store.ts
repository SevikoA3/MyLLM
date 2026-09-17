import type { SQLiteDatabase } from 'expo-sqlite';

import {
  titleFromPrompt,
  type ChatMessage,
  type ConversationCursor,
  type ConversationSummary,
  type TurnStatus,
} from '../../domain/conversation';
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
};

type ItemRow = {
  id: string;
  role: ChatMessage['role'];
  status: TurnStatus;
  content_json: string;
  turn_id: string;
};

type TurnRow = {
  id: string;
  status: TurnStatus;
  response_id: string | null;
  content_json: string | null;
};

type SummaryRow = ConversationRow & { status: TurnStatus | null };

async function nativeDatabase(): Promise<SQLiteDatabase> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  return openDatabaseAsync(DATABASE_NAME);
}

export function createConversationRepository(
  resolveDatabase: () => Promise<SQLiteDatabase> = nativeDatabase,
  now: () => number = Date.now,
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

  async function migrateAndRecover(): Promise<void> {
    const db = await database();
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 1) {
      throw new Error('Database conversation dibuat oleh versi aplikasi yang lebih baru.');
    }
    if ((version?.user_version ?? 0) === 0) {
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(MIGRATION_V1);
        await transaction.execAsync('PRAGMA user_version = 1');
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
           (id, title, created_at, updated_at, endpoint_id, active_model_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            conversationId,
            titleFromPrompt(input.prompt),
            timestamp,
            timestamp,
            input.endpointId,
            input.modelId,
          ],
        );
      } else {
        await transaction.runAsync(
          `UPDATE conversations SET updated_at = ?, active_model_id = ? WHERE id = ?`,
          [timestamp, input.modelId, conversationId],
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

  async function loadConversation(id: string): Promise<{
    id: string;
    title: string;
    messages: ChatMessage[];
    previousResponseId: string | null;
    previousResponseModelId: string | null;
    retry: { turnId: string; assistantItemId: string; prompt: string } | null;
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
      previousResponseId: previous?.response_id ?? null,
      previousResponseModelId: previous?.model_id ?? null,
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
    startTurn,
    restartTurn,
    flushAssistant,
    finishTurn,
    loadConversation,
    loadLatest,
    list,
    rename,
    remove,
  };
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

export const conversationRepository = createConversationRepository();
