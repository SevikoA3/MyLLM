import { createToolRegistry } from './registry';

describe('toolRegistry', () => {
  it('only exposes the app-owned read-only clock tool', async () => {
    const registry = createToolRegistry(() => Date.UTC(2026, 8, 18, 0, 0, 0));

    expect(registry.definitions()).toHaveLength(1);
    expect(registry.find('missing')).toBeNull();
    await expect(
      registry.find('get_current_time')?.execute({ timezone: 'Asia/Jakarta' }, new AbortController().signal),
    ).resolves.toContain('2026-09-18T00:00:00.000Z');
  });
});
