import { describe, expect, it } from 'vitest';
import { parseDirectionOptions } from './direction-options';

describe('parseDirectionOptions', () => {
  it('方向选项正常解析为卡片', () => {
    const text = [
      '我想到三个方向：',
      '',
      '① 深夜 emo 说唱（lo-fi hip hop, dark, rap）',
      '画面是凌晨三点的便利店，第一句可以是「冰柜的灯比我诚实」',
      '',
      '② 夏日公路流行（upbeat pop, nostalgic, female vocals）',
      '画面是车窗外的海',
      '',
      '③ 咖啡馆器乐（acoustic jazz, calm, instrumental）',
      '适合当背景音乐',
    ].join('\n');
    const segs = parseDirectionOptions(text);
    expect(segs).not.toBeNull();
    const options = segs!.filter((s) => s.kind === 'options');
    expect(options).toHaveLength(1);
    expect((options[0] as { options?: unknown[] }).options).toHaveLength(3);
  });

  it('澄清问题列表回退为纯文本（不被渲染成选项卡片）', () => {
    const text = [
      '开始前先确认三件事：',
      '',
      '① 你想要什么语种的歌？',
      '② 这首歌是给谁的、什么场合用？',
      '③ 你偏好什么风格？',
    ].join('\n');
    expect(parseDirectionOptions(text)).toBeNull();
  });

  it('单行疑问形式的问题列表也回退', () => {
    const text = '① 节奏快一点还是慢一点？\n\n② 男声还是女声？\n\n③ 要副歌重复吗？';
    expect(parseDirectionOptions(text)).toBeNull();
  });

  it('试听反馈定位的紧凑列表（无空行）按既有行为回退纯文本', () => {
    // 既有边界：选项必须空行分隔才能识别；紧凑单行列表整体回退文本渲染，用户手动回复即可。
    const text = ['是哪里不对——', '', '① 节奏/速度', '② 人声唱腔', '③ 旋律走向', '④ 编曲配器'].join('\n');
    expect(parseDirectionOptions(text)).toBeNull();
  });

  it('问题与方向选项混排时不启用卡片渲染（整体回退文本）', () => {
    const text = ['① 什么语种？', '', '② 深夜 emo 说唱（lo-fi hip hop, dark, rap）', '画面是凌晨三点的便利店'].join('\n');
    expect(parseDirectionOptions(text)).toBeNull();
  });
});
