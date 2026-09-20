import type { SQLiteDatabase } from 'expo-sqlite';

import { createConversationRepository } from './conversation-store';

describe('conversationRepository.clear', () => {
  it('menghapus database tanpa membuka koneksi baru', async () => {
    let deleted = false;
    const repository = createConversationRepository(
      async () => {
        throw new Error('database must not open during clear');
      },
      Date.now,
      async () => {
        deleted = true;
      },
    );

    await repository.clear();

    expect(deleted).toBe(true);
  });

  it('serializes concurrent writes', async () => {
    let activeWrites = 0;
    let maxConcurrentWrites = 0;
    let blockNextWrite = false;
    let signalBlockedWrite: () => void = () => {};
    let releaseBlockedWrite: () => void = () => {};
    const blockedWrite = new Promise<void>((resolve) => {
      signalBlockedWrite = resolve;
    });
    const releaseWrite = new Promise<void>((resolve) => {
      releaseBlockedWrite = resolve;
    });
    const transaction = {
      execAsync: jest.fn(async () => undefined),
      getFirstAsync: jest.fn(async () => null),
      getAllAsync: jest.fn(async () => []),
      runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
    } as unknown as SQLiteDatabase;
    const database = {
      execAsync: jest.fn(async () => undefined),
      getFirstAsync: jest.fn(async () => ({ user_version: 3 })),
      runAsync: jest.fn(async () => {
        if (activeWrites > 0) {
          throw new Error('database is locked');
        }
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withExclusiveTransactionAsync: jest.fn(async (task: (tx: SQLiteDatabase) => Promise<void>) => {
        activeWrites += 1;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
        if (blockNextWrite) {
          signalBlockedWrite();
          await releaseWrite;
        }
        try {
          await task(transaction);
        } finally {
          activeWrites -= 1;
        }
      }),
    } as unknown as SQLiteDatabase;
    const repository = createConversationRepository(async () => database);

    await repository.initialize();
    blockNextWrite = true;
    const started = repository.startTurn({
      conversationId: null,
      turnId: 'turn_1',
      userItemId: 'user_1',
      assistantItemId: 'assistant_1',
      prompt: 'Hello',
      attachments: [],
      endpointId: 'endpoint_1',
      modelId: 'model_1',
      previousResponseId: null,
      reasoningSetting: null,
      outputCeiling: null,
      autoCompact: true,
    });
    await blockedWrite;
    const autoCompact = repository.setAutoCompact('conversation_1', false);
    blockNextWrite = false;
    releaseBlockedWrite();

    await expect(Promise.all([started, autoCompact])).resolves.toHaveLength(2);
    expect(maxConcurrentWrites).toBe(1);
  });
});
