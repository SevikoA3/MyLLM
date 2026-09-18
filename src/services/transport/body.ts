export const MAX_RESPONSE_BODY_BYTES = 256 * 1024;

export type ReadResponseTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'too-large' };

export async function readResponseText(
  response: Response,
  maxBytes = MAX_RESPONSE_BODY_BYTES,
): Promise<ReadResponseTextResult> {
  if (response.body === null) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength > maxBytes
      ? { ok: false, reason: 'too-large' }
      : { ok: true, text };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      bytes += next.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too-large' };
      }
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } finally {
    reader.releaseLock();
  }
}
