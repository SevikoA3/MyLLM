import { MAX_RESPONSE_BODY_BYTES, readResponseText } from './body';

describe('response body safety', () => {
  it('membaca body kecil dan menolak body yang melewati cap', async () => {
    await expect(readResponseText(new Response('aman'))).resolves.toEqual({ ok: true, text: 'aman' });
    await expect(
      readResponseText(new Response('x'.repeat(MAX_RESPONSE_BODY_BYTES + 1))),
    ).resolves.toEqual({ ok: false, reason: 'too-large' });
  });
});
