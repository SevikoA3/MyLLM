#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const { createConversationRepository } = await import(
  '../.tests-build/services/persistence/conversation-store.js'
);

test('migration v3 membuat tool_calls, WAL, dan foreign key aktif', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'myllm-conversations-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const { raw, repository } = setup(join(directory, 'test.db'));
  await repository.initialize();

  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(raw.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(raw.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  const names = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.deepEqual(names, ['compactions', 'conversations', 'items', 'timing', 'tool_calls', 'turns', 'usage']);
  assert.equal(raw.prepare('SELECT auto_compact FROM conversations').get(), undefined);
});

test('partial stream tersimpan dan restart menandai assistant interrupted', async () => {
  const state = setup();
  const { conversationId } = await start(state.repository, 'turn_1', null, 'partial prompt');
  await state.repository.flushAssistant('turn_1', 'assistant_turn_1', 'jawaban parsial', 'ringkas');

  const restarted = createConversationRepository(async () => state.database, () => 200);
  await restarted.initialize();
  const loaded = await restarted.loadConversation(conversationId);

  assert.equal(loaded.messages[1].text, 'jawaban parsial');
  assert.equal(loaded.messages[1].reasoningSummary, 'ringkas');
  assert.equal(loaded.messages[1].status, 'interrupted');
  assert.equal(loaded.retry.prompt, 'partial prompt');
});

test('request history memuat user dan assistant completed secara berurutan', async () => {
  const state = setup();
  const first = await start(state.repository, 'turn_1', null, 'Jelaskan X.');
  await state.repository.finishTurn({
    turnId: 'turn_1',
    assistantItemId: 'assistant_turn_1',
    status: 'completed',
    text: 'X adalah...',
    reasoningSummary: null,
    responseId: 'resp_1',
    usage: null,
    timing: null,
  });
  await start(state.repository, 'turn_2', first.conversationId, 'Kamu tahu tadi aku tanya apa?');

  assert.deepEqual(await state.repository.loadRequestHistory(first.conversationId), [
    { role: 'user', content: 'Jelaskan X.' },
    { role: 'assistant', content: 'X adalah...' },
    { role: 'user', content: 'Kamu tahu tadi aku tanya apa?' },
  ]);
});

test('staged image survives a process restart and remains in request history', async () => {
  const state = setup();
  const attachment = imageAttachment('image_1', 'file:///documents/attachments/image_1.png');
  const { conversationId } = await start(state.repository, 'turn_1', null, '', [attachment]);

  const restarted = createConversationRepository(async () => state.database, () => 200);
  assert.deepEqual(await restarted.loadRequestHistory(conversationId), [
    { role: 'user', content: '', attachments: [attachment] },
  ]);
  assert.deepEqual(await restarted.loadImageAttachments(), [attachment]);
});

test('delete conversation membersihkan turn, item, usage, dan timing lewat cascade', async () => {
  const state = setup();
  const { conversationId } = await start(state.repository, 'turn_1', null, 'hapus saya');
  await state.repository.remove(conversationId);

  for (const table of ['conversations', 'turns', 'items', 'tool_calls', 'usage', 'timing']) {
    assert.equal(state.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
});

test('delete only removes staged images no other conversation references', async () => {
  const state = setup();
  const attachment = imageAttachment('image_1', 'file:///documents/attachments/image_1.png');
  const first = await start(state.repository, 'turn_1', null, 'first', [attachment]);
  const second = await start(state.repository, 'turn_2', null, 'second', [attachment]);
  const removed = [];

  await state.repository.remove(first.conversationId, (images) => removed.push(...images));
  assert.deepEqual(removed, []);

  await state.repository.remove(second.conversationId, (images) => removed.push(...images));
  assert.deepEqual(removed, [attachment]);
});

test('pagination stabil memakai updatedAt dan ID', async () => {
  const state = setup();
  const ids = [];
  for (let index = 1; index <= 3; index += 1) {
    const result = await start(state.repository, `turn_${index}`, null, `prompt ${index}`);
    ids.push(result.conversationId);
  }

  const first = await state.repository.list(2);
  const second = await state.repository.list(2, first.nextCursor);
  assert.deepEqual(
    [...first.conversations, ...second.conversations].map((conversation) => conversation.id),
    [...ids].sort().reverse(),
  );
  assert.equal(new Set([...first.conversations, ...second.conversations].map((item) => item.id)).size, 3);
  assert.equal(second.nextCursor, null);
});

test('send setelah conversation dihapus membuat conversation baru tanpa turn yatim', async () => {
  const state = setup();
  const first = await start(state.repository, 'turn_1', null, 'awal');
  await state.repository.remove(first.conversationId);
  const second = await start(state.repository, 'turn_2', first.conversationId, 'baru');

  assert.notEqual(second.conversationId, first.conversationId);
  assert.equal(state.raw.prepare('SELECT COUNT(*) AS count FROM turns').get().count, 1);
  assert.equal(
    state.raw.prepare('SELECT conversation_id FROM turns').get().conversation_id,
    second.conversationId,
  );
});

test('turn menyimpan request snapshot, response ID, usage, dan timing', async () => {
  const state = setup();
  await start(state.repository, 'turn_meta', null, 'metadata');
  await state.repository.finishTurn({
    turnId: 'turn_meta',
    assistantItemId: 'assistant_turn_meta',
    status: 'completed',
    text: 'selesai',
    reasoningSummary: null,
    responseId: 'resp_exact',
    usage: { input_tokens: 12, output_tokens: 4 },
    timing: { requestStart: 1, firstEvent: 2, firstVisibleToken: 3, completed: 4 },
  });

  const turn = state.raw.prepare('SELECT * FROM turns WHERE id = ?').get('turn_meta');
  assert.equal(turn.endpoint_id, 'endpoint_1');
  assert.equal(turn.model_id, 'model-exact');
  assert.equal(turn.reasoning_setting, null);
  assert.equal(turn.output_ceiling, 1024);
  assert.equal(turn.response_id, 'resp_exact');
  assert.deepEqual(
    JSON.parse(state.raw.prepare('SELECT raw_json FROM usage WHERE turn_id = ?').get('turn_meta').raw_json),
    { input_tokens: 12, output_tokens: 4 },
  );
  assert.deepEqual(
    { ...state.raw.prepare('SELECT * FROM timing WHERE turn_id = ?').get('turn_meta') },
    { turn_id: 'turn_meta', request_start: 1, first_event: 2, first_visible_token: 3, completed: 4 },
  );
});

test('tool call menyimpan approval dan result, lalu dedupe call ID', async () => {
  const state = setup();
  await start(state.repository, 'turn_tool', null, 'time?');
  const created = await state.repository.recordToolCall({
    id: 'tool_1',
    turnId: 'turn_tool',
    callId: 'call_1',
    name: 'get_current_time',
    argumentsJson: '{"timezone":"Asia/Jakarta"}',
    target: 'Device clock',
    sideEffect: 'Reads device time.',
    status: 'awaiting_approval',
    approval: 'pending',
    result: null,
  });
  assert.equal(created.status, 'awaiting_approval');
  const completed = await state.repository.updateToolCall({
    id: 'tool_1',
    status: 'completed',
    approval: 'approved',
    result: { callId: 'call_1', output: '{"time":"10:00"}', isError: false },
  });
  const duplicate = await state.repository.recordToolCall({
    ...created,
    id: 'tool_2',
    turnId: 'turn_tool',
  });

  assert.deepEqual(completed.result, { callId: 'call_1', output: '{"time":"10:00"}', isError: false });
  assert.equal(duplicate.id, 'tool_1');
  assert.deepEqual(duplicate.result, completed.result);
  const loaded = await state.repository.loadConversation(
    state.raw.prepare('SELECT conversation_id FROM turns WHERE id = ?').get('turn_tool').conversation_id,
  );
  assert.deepEqual(loaded.toolActivities.assistant_turn_tool, [completed]);
});

test('in-flight tool call becomes interrupted after restart', async () => {
  const state = setup();
  await start(state.repository, 'turn_tool', null, 'time?');
  await state.repository.recordToolCall({
    id: 'tool_1',
    turnId: 'turn_tool',
    callId: 'call_1',
    name: 'get_current_time',
    argumentsJson: '{"timezone":"UTC"}',
    target: 'Device clock',
    sideEffect: 'Reads device time.',
    status: 'executing',
    approval: 'approved',
    result: null,
  });

  const restarted = createConversationRepository(async () => state.database, () => 200);
  await restarted.initialize();

  assert.equal(state.raw.prepare('SELECT status FROM tool_calls WHERE id = ?').get('tool_1').status, 'interrupted');
});

test('compaction memakai summary untuk request tetapi transcript asli tetap lengkap', async () => {
  const state = setup();
  let conversationId = null;
  for (let index = 1; index <= 6; index += 1) {
    const started = await start(state.repository, `turn_${index}`, conversationId, `user ${index}`);
    conversationId = started.conversationId;
    await state.repository.finishTurn({
      turnId: `turn_${index}`,
      assistantItemId: `assistant_turn_${index}`,
      status: 'completed',
      text: `assistant ${index}`,
      reasoningSummary: null,
      responseId: `response_${index}`,
      usage: null,
      timing: null,
    });
  }

  const source = await state.repository.loadCompactionSource(conversationId);
  const compactionId = await state.repository.beginCompaction({
    conversationId,
    sourceStartTurnId: source.turns[0].turnId,
    sourceEndTurnId: source.turns[1].turnId,
    sourceStartOrdinal: source.turns[0].ordinal,
    sourceEndOrdinal: source.turns[1].ordinal,
    modelId: 'model-exact',
    promptVersion: 1,
    beforeEstimate: 100,
  });
  await state.repository.completeCompaction({
    id: compactionId,
    summary: summary(),
    usage: { input_tokens: 20, output_tokens: 10 },
    afterEstimate: 50,
  });

  const history = await state.repository.loadRequestHistory(conversationId);
  assert.equal(history.length, 9);
  assert.match(history[0].content, /local compaction summary/);
  assert.equal((await state.repository.loadConversation(conversationId)).messages.length, 12);
});

test('compaction running yang terputus menjadi interrupted dan tidak active', async () => {
  const state = setup();
  const started = await start(state.repository, 'turn_1', null, 'awal');
  const source = await state.repository.loadCompactionSource(started.conversationId);
  const compactionId = await state.repository.beginCompaction({
    conversationId: started.conversationId,
    sourceStartTurnId: source.turns[0]?.turnId ?? 'turn_1',
    sourceEndTurnId: source.turns[0]?.turnId ?? 'turn_1',
    sourceStartOrdinal: 1,
    sourceEndOrdinal: 1,
    modelId: 'model-exact',
    promptVersion: 1,
    beforeEstimate: 100,
  });
  assert.notEqual(compactionId, null);

  const restarted = createConversationRepository(async () => state.database, () => 200);
  await restarted.initialize();

  assert.equal(
    state.raw.prepare('SELECT status FROM compactions WHERE id = ?').get(compactionId).status,
    'interrupted',
  );
  assert.deepEqual(await restarted.loadRequestHistory(started.conversationId), [
    { role: 'user', content: 'awal' },
  ]);
});

function setup(path = ':memory:') {
  const raw = new DatabaseSync(path);
  const database = adapter(raw);
  return { raw, database, repository: createConversationRepository(async () => database, () => 100) };
}

function start(repository, turnId, conversationId, prompt, attachments = []) {
  return repository.startTurn({
    conversationId,
    turnId,
    userItemId: `user_${turnId}`,
    assistantItemId: `assistant_${turnId}`,
    prompt,
    attachments,
    endpointId: 'endpoint_1',
    modelId: 'model-exact',
    previousResponseId: null,
    reasoningSetting: null,
    outputCeiling: 1024,
    autoCompact: true,
  });
}

function imageAttachment(id, uri) {
  return {
    id,
    name: 'image.png',
    mimeType: 'image/png',
    byteSize: 100,
    uri,
  };
}

function summary() {
  return {
    userGoals: ['goal'],
    constraints: ['constraint'],
    decisions: ['decision'],
    facts: ['fact'],
    artifacts: ['artifact'],
    completedActions: ['action'],
    toolResults: [],
    openQuestions: ['question'],
    nextSteps: ['next'],
    untrustedContentNotes: ['note'],
  };
}

function adapter(database) {
  return {
    async execAsync(source) {
      database.exec(source);
    },
    async runAsync(source, params = []) {
      return database.prepare(source).run(...params);
    },
    async getFirstAsync(source, params = []) {
      return database.prepare(source).get(...params) ?? null;
    },
    async getAllAsync(source, params = []) {
      return database.prepare(source).all(...params);
    },
    async withExclusiveTransactionAsync(task) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await task(this);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
