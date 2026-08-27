import { describe, expect, it } from 'vitest';
import { ThinkStreamSplitter, splitThinkText } from './think-stream';

function collect(chunks: string[]) {
  const splitter = new ThinkStreamSplitter();
  const text: string[] = [];
  const thinking: string[] = [];
  let ends = 0;
  for (const chunk of chunks) {
    for (const piece of splitter.push(chunk)) {
      if (piece.type === 'text') text.push(piece.text);
      else if (piece.type === 'thinking') thinking.push(piece.delta);
      else ends += 1;
    }
  }
  for (const piece of splitter.flush()) {
    if (piece.type === 'text') text.push(piece.text);
    else if (piece.type === 'thinking') thinking.push(piece.delta);
    else ends += 1;
  }
  return { text: text.join(''), thinking: thinking.join(''), ends };
}

describe('ThinkStreamSplitter', () => {
  it('把完整 think 块拆成独立思考链与正文', () => {
    const result = collect(['<think>先想一下</think>\n\n你好，这是正文']);
    expect(result.thinking).toBe('先想一下');
    expect(result.text).toBe('\n\n你好，这是正文');
    expect(result.ends).toBe(1);
  });

  it('跨 chunk 拆开标记与内容', () => {
    const result = collect(['<th', 'ink>我在思考</', 'think>正文']);
    expect(result.thinking).toBe('我在思考');
    expect(result.text).toBe('正文');
    expect(result.ends).toBe(1);
  });

  it('未闭合的 think 块 flush 后仍按思考链处理', () => {
    const result = collect(['<think>还没写完']);
    expect(result.thinking).toBe('还没写完');
    expect(result.text).toBe('');
    expect(result.ends).toBe(1);
  });

  it('没有 think 标记时正文原样输出', () => {
    const result = collect(['普通正文', '继续']);
    expect(result.thinking).toBe('');
    expect(result.text).toBe('普通正文继续');
    expect(result.ends).toBe(0);
  });
});

describe('splitThinkText', () => {
  it('完整消息提取正文与思考链', () => {
    expect(splitThinkText('<think>推理</think>正文')).toEqual({
      text: '正文',
      thinking: '推理',
    });
  });

  it('多段 think 合并全部思考链', () => {
    expect(splitThinkText('<think>一</think>正文<think>二</think>结尾')).toEqual({
      text: '正文结尾',
      thinking: '一二',
    });
  });
});
