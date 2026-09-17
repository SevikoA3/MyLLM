import { createSseParser } from './sse';

const encoder = new TextEncoder();

describe('createSseParser', () => {
  it('menjaga UTF-8 multibyte yang terbelah antar chunk', () => {
    const bytes = encoder.encode('event: response.output_text.delta\ndata: {"delta":"A😀B"}\n\n');
    const emoji = bytes.indexOf(0xf0);
    const parser = createSseParser();

    expect(parser.push(bytes.slice(0, emoji + 2)).frames).toEqual([]);
    expect(parser.push(bytes.slice(emoji + 2)).frames).toEqual([
      { event: 'response.output_text.delta', data: '{"delta":"A😀B"}' },
    ]);
  });

  it('menerima CRLF, comment heartbeat, event field, dan multiline data', () => {
    const parser = createSseParser();
    const result = parser.push(
      encoder.encode(': ping\r\nevent: custom\r\ndata: baris satu\r\ndata: baris dua\r\n\r\n'),
    );

    expect(result).toEqual({
      frames: [{ event: 'custom', data: 'baris satu\nbaris dua' }],
      done: false,
    });
  });

  it('menunggu frame lengkap ketika JSON terbelah dan mengenali DONE', () => {
    const parser = createSseParser();
    expect(parser.push(encoder.encode('data: {"type":"response.cre')).frames).toEqual([]);
    expect(parser.push(encoder.encode('ated"}\n\n')).frames).toHaveLength(1);
    expect(parser.push(encoder.encode('data: [DONE]\n\n'))).toEqual({ frames: [], done: true });
  });

  it('mengeluarkan frame terakhir saat EOF tanpa baris kosong', () => {
    const parser = createSseParser();
    parser.push(encoder.encode('event: response.output_text.delta\ndata: {"delta":"partial"}'));

    expect(parser.finish()).toEqual({
      frames: [
        { event: 'response.output_text.delta', data: '{"delta":"partial"}' },
      ],
      done: false,
    });
  });
});
