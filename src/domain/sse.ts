export type SseFrame = {
  event: string | null;
  data: string;
};

export type SseParseResult = {
  frames: SseFrame[];
  done: boolean;
};

/** Parser SSE incremental. Decoder dipertahankan agar byte UTF-8 boleh terbelah antar chunk. */
export function createSseParser() {
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | null = null;
  let data: string[] = [];
  let done = false;

  function dispatch(frames: SseFrame[]): void {
    if (data.length === 0) {
      event = null;
      return;
    }
    const value = data.join('\n');
    if (value === '[DONE]') {
      done = true;
    } else {
      frames.push({ event, data: value });
    }
    event = null;
    data = [];
  }

  function line(value: string, frames: SseFrame[]): void {
    if (value.length === 0) {
      dispatch(frames);
      return;
    }
    if (value.startsWith(':')) {
      return;
    }
    const separator = value.indexOf(':');
    const field = separator === -1 ? value : value.slice(0, separator);
    let fieldValue = separator === -1 ? '' : value.slice(separator + 1);
    if (fieldValue.startsWith(' ')) {
      fieldValue = fieldValue.slice(1);
    }
    if (field === 'event') {
      event = fieldValue.length === 0 ? null : fieldValue;
    } else if (field === 'data') {
      data.push(fieldValue);
    }
  }

  function drain(text: string, flush: boolean): SseParseResult {
    if (done) {
      return { frames: [], done: true };
    }
    buffer += text;
    const frames: SseFrame[] = [];
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const raw = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      line(raw.endsWith('\r') ? raw.slice(0, -1) : raw, frames);
      if (done) {
        buffer = '';
        return { frames, done };
      }
      newline = buffer.indexOf('\n');
    }
    if (flush) {
      if (buffer.length > 0) {
        line(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer, frames);
        buffer = '';
      }
      dispatch(frames);
    }
    return { frames, done };
  }

  return {
    push(chunk: Uint8Array): SseParseResult {
      return drain(decoder.decode(chunk, { stream: true }), false);
    },
    finish(): SseParseResult {
      return drain(decoder.decode(), true);
    },
  };
}
