import * as z from 'zod';

const ResponseEnvelopeSchema = z.object({
  id: z.string().trim().min(1),
  output: z.array(z.unknown()),
});

export type ParsedResponse = {
  id: string;
  text: string | null;
  reasoningSummary: string | null;
};

export type ParseResponseResult =
  | { ok: true; response: ParsedResponse }
  | { ok: false; message: string };

/** Ambil hanya item teks yang dikenal. Item tool atau extension tetap diabaikan. */
export function parseResponseBody(body: string): ParseResponseResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, message: 'Response bukan JSON yang valid.' };
  }

  const parsed = ResponseEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: 'Response tidak memiliki id dan output yang valid.' };
  }

  const text: string[] = [];
  const reasoning: string[] = [];
  for (const item of parsed.data.output) {
    if (!isRecord(item)) {
      continue;
    }
    collectText(item.content, 'output_text', text);
    collectText(item.summary, 'summary_text', reasoning);
  }

  return {
    ok: true,
    response: {
      id: parsed.data.id,
      text: text.length === 0 ? null : text.join('\n\n'),
      reasoningSummary: reasoning.length === 0 ? null : reasoning.join('\n\n'),
    },
  };
}

function collectText(value: unknown, expectedType: string, target: string[]): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const entry of value) {
    if (
      isRecord(entry) &&
      entry.type === expectedType &&
      typeof entry.text === 'string' &&
      entry.text.length > 0
    ) {
      target.push(entry.text);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
