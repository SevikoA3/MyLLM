import { parseResponseBody } from './response';

describe('parseResponseBody', () => {
  it('mengambil text dari semua message tanpa mengasumsikan output pertama', () => {
    const result = parseResponseBody(
      JSON.stringify({
        id: 'resp_1',
        output: [
          { type: 'tool_call', call_id: 'call_1' },
          { type: 'message', content: [{ type: 'output_text', text: 'Bagian satu.' }] },
          { type: 'message', content: [{ type: 'output_text', text: 'Bagian dua.' }] },
        ],
      }),
    );

    expect(result).toEqual({
      ok: true,
      response: {
        id: 'resp_1',
        text: 'Bagian satu.\n\nBagian dua.',
        reasoningSummary: null,
      },
    });
  });

  it('mengambil optional reasoning summary', () => {
    const result = parseResponseBody(
      JSON.stringify({
        id: 'resp_2',
        output: [
          { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Ringkas.' }] },
          { type: 'message', content: [{ type: 'output_text', text: 'Jawaban.' }] },
        ],
      }),
    );

    expect(result.ok && result.response.reasoningSummary).toBe('Ringkas.');
  });

  it('menerima response valid tanpa text dan mengabaikan item asing', () => {
    const result = parseResponseBody(
      JSON.stringify({ id: 'resp_3', output: [{ type: 'custom', content: [] }] }),
    );

    expect(result).toEqual({
      ok: true,
      response: { id: 'resp_3', text: null, reasoningSummary: null },
    });
  });

  it('menolak JSON dan envelope yang tidak valid', () => {
    expect(parseResponseBody('{').ok).toBe(false);
    expect(parseResponseBody(JSON.stringify({ output: [] })).ok).toBe(false);
  });
});
