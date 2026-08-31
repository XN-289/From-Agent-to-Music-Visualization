import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import manifest from '../harness/prompt-stages.json';
import {
  PROMPT_STAGE_ORDER,
  buildBaselineSystemPrompt,
  buildSystemPrompt,
  estimatePromptTokens,
  getPromptStageFiles,
} from './prompt';
import { resolvePromptStage } from './prompt-stage';

const BASELINE = buildBaselineSystemPrompt();
const BASELINE_TOKENS = estimatePromptTokens(BASELINE);

describe('prompt stage manifest', () => {
  it('keeps the legacy full prompt as the baseline file list', () => {
    expect(manifest.baselineFiles.map((part) => part.file)).toEqual([
      'prompt.md',
      'domain/scenarios.md',
      'domain/lyric-writing.md',
      'domain/style-tags.md',
      'domain/song-structure.md',
      'domain/chinese-style.md',
      'domain/arrangement-vocal.md',
      'domain/pronunciation-quirks.md',
      'domain/quality-gates.md',
      'workflow.md',
    ]);
    expect(BASELINE).toContain('需求未确认不得生成');
    expect(BASELINE).toContain('双语歌词翻译规范');
    expect(BASELINE).toContain('试听反馈访谈');
  });

  it('declares every stage file and rubric without empty prompts', () => {
    for (const stage of PROMPT_STAGE_ORDER) {
      const files = getPromptStageFiles(stage);
      const prompt = buildSystemPrompt(stage);
      expect(files.length).toBeGreaterThan(0);
      expect(files.map((part) => part.file)).toEqual(
        expect.arrayContaining(['stages/core.md', `stages/${stage}.md`]),
      );
      for (const part of files) {
        const content = readFileSync(`src/lib/harness/${part.file}`, 'utf8').trim();
        expect(content).not.toBe('');
        expect(prompt).toContain(content);
      }
      expect(prompt.trim()).not.toBe('');
      expect(manifest.stages[stage].qualityRegression.case).toBeTruthy();
    }
  });
});

describe('prompt stage token and quality regression', () => {
  it.each(PROMPT_STAGE_ORDER)('reduces %s prompt by at least 40%', (stage) => {
    const prompt = buildSystemPrompt(stage);
    const tokens = estimatePromptTokens(prompt);
    const reduction = (BASELINE_TOKENS - tokens) / BASELINE_TOKENS;

    expect(tokens).toBeGreaterThan(0);
    expect(reduction).toBeGreaterThanOrEqual(0.4);
  });

  it.each(PROMPT_STAGE_ORDER)('passes the %s stage quality rubric', (stage) => {
    const prompt = buildSystemPrompt(stage);
    const rubric = manifest.stages[stage].qualityRegression;

    for (const marker of rubric.mustContain) expect(prompt).toContain(marker);
    for (const marker of rubric.mustNotContain) expect(prompt).not.toContain(marker);
  });
});

describe('prompt stage routing', () => {
  it('starts fuzzy requests in discovery and complete requests in lyric', () => {
    expect(resolvePromptStage({ text: '帮我写首歌吧，好听的就行' })).toBe('discovery');
    expect(
      resolvePromptStage({ text: '写一首关于夏夜散步的民谣，男声木吉他，两分钟左右' }),
    ).toBe('lyric');
  });

  it('advances discovery confirmation to lyric and lyric confirmation to generation', () => {
    expect(resolvePromptStage({ text: '可以', currentStage: 'discovery' })).toBe('lyric');
    expect(resolvePromptStage({ text: '就这个', currentStage: 'lyric' })).toBe('generation');
  });

  it('does not enter generation from an empty conversation or a complete first request', () => {
    expect(resolvePromptStage({ text: '生成吧' })).toBe('discovery');
    expect(resolvePromptStage({ text: '开始生成' })).toBe('discovery');
    expect(
      resolvePromptStage({ text: '写一首关于夏夜散步的民谣，直接生成' }),
    ).toBe('lyric');
    expect(resolvePromptStage({ text: '生成吧', hasExistingSong: true })).toBe('iteration');
  });

  it('routes existing-song feedback and iteration intents to iteration', () => {
    expect(resolvePromptStage({ text: '刚才那首歌感觉不对' })).toBe('iteration');
    expect(resolvePromptStage({ text: '帮我把上次那首加长一段' })).toBe('iteration');
    expect(
      resolvePromptStage({ text: '继续', currentStage: 'generation', hasExistingSong: true }),
    ).toBe('iteration');
  });

  it('allows an explicit new topic to restart discovery', () => {
    expect(
      resolvePromptStage({
        text: '新写一首关于开工的摇滚',
        currentStage: 'iteration',
        hasExistingSong: true,
      }),
    ).toBe('lyric');
  });
});

describe('pi resource loading', () => {
  it('exposes each assembled stage prompt through DefaultResourceLoader.reload()', async () => {
    const agentDir = await mkdtemp(path.join(tmpdir(), 'music-agent-prompt-'));
    try {
      for (const stage of PROMPT_STAGE_ORDER) {
        const expected = buildSystemPrompt(stage);
        const loader = new DefaultResourceLoader({
          cwd: process.cwd(),
          agentDir,
          systemPrompt: expected,
          noContextFiles: true,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noExtensions: true,
        });
        await loader.reload({});
        expect(loader.getSystemPrompt()).toBe(expected);
      }
    } finally {
      await rm(agentDir, { recursive: true, force: true });
    }
  });
});
