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
});
