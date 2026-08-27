export type ThinkStreamPiece =
  | { type: 'text'; text: string }
  | { type: 'thinking'; delta: string }
  | { type: 'thinking_end' };

const OPEN = '<think>';
const CLOSE = '</think>';

/**
 * Some relay providers put reasoning inside the normal content stream as
 * `<think>...</think>` instead of exposing `reasoning_content`. This splitter
 * turns that raw stream back into separate text and thinking deltas, while
 * tolerating markers that arrive across multiple chunks.
 */
export class ThinkStreamSplitter {
  private buffer = '';
  private inThink = false;

  push(chunk: string): ThinkStreamPiece[] {
    if (!chunk) return [];
    this.buffer += chunk;
    const out: ThinkStreamPiece[] = [];

    for (;;) {
      if (!this.inThink) {
        const idx = this.buffer.indexOf(OPEN);
        if (idx < 0) {
          // Hold back a suffix that may become the opening marker.
          const hold = OPEN.length - 1;
          if (this.buffer.length > hold) {
            const emit = this.buffer.slice(0, this.buffer.length - hold);
            this.buffer = this.buffer.slice(this.buffer.length - hold);
            if (emit) out.push({ type: 'text', text: emit });
          }
          break;
        }
        if (idx > 0) out.push({ type: 'text', text: this.buffer.slice(0, idx) });
        this.buffer = this.buffer.slice(idx + OPEN.length);
        this.inThink = true;
        continue;
      }

      const idx = this.buffer.indexOf(CLOSE);
      if (idx < 0) {
        // Hold back a suffix that may become the closing marker.
        const hold = CLOSE.length - 1;
        if (this.buffer.length > hold) {
          const emit = this.buffer.slice(0, this.buffer.length - hold);
          this.buffer = this.buffer.slice(this.buffer.length - hold);
          if (emit) out.push({ type: 'thinking', delta: emit });
        }
        break;
      }
      if (idx > 0) out.push({ type: 'thinking', delta: this.buffer.slice(0, idx) });
      this.buffer = this.buffer.slice(idx + CLOSE.length);
      this.inThink = false;
      out.push({ type: 'thinking_end' });
    }

    return out;
  }

  flush(): ThinkStreamPiece[] {
    const out: ThinkStreamPiece[] = [];
    if (this.buffer) {
      out.push(
        this.inThink
          ? { type: 'thinking', delta: this.buffer }
          : { type: 'text', text: this.buffer },
      );
      this.buffer = '';
    }
    if (this.inThink) {
      out.push({ type: 'thinking_end' });
      this.inThink = false;
    }
    return out;
  }
}

/** Stateless split of a complete message for persistence/fallback paths. */
export function splitThinkText(text: string): { text: string; thinking: string } {
  if (!text) return { text: '', thinking: '' };
  const splitter = new ThinkStreamSplitter();
  const pieces = splitter.push(text);
  let body = '';
  let thinking = '';
  for (const piece of pieces) {
    if (piece.type === 'text') body += piece.text;
    else if (piece.type === 'thinking') thinking += piece.delta;
  }
  for (const piece of splitter.flush()) {
    if (piece.type === 'text') body += piece.text;
    else if (piece.type === 'thinking') thinking += piece.delta;
  }
  return { text: body, thinking };
}
