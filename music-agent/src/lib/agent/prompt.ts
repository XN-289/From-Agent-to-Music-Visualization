// 音乐制作人 harness 组装器。
// baselineFiles 保持旧全量 prompt 的审计口径；运行时按 prompt-stages.json
// 只装载当前阶段声明的 Markdown，避免把写词百科带进需求澄清请求。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import manifest from '../harness/prompt-stages.json';
import type { PromptStage } from './prompt-stage';

const HARNESS_DIR = path.join(process.cwd(), 'src', 'lib', 'harness');

interface PromptFile {
  file: string;
  title: string;
}

const BASELINE_FILES = manifest.baselineFiles as PromptFile[];
const STAGE_FILES = manifest.stages as Record<
  PromptStage,
  { label: string; files: PromptFile[] }
>;

export const PROMPT_STAGE_ORDER = manifest.stageOrder as PromptStage[];

function readPart({ file, title }: PromptFile): string {
  try {
    const content = readFileSync(path.join(HARNESS_DIR, file), 'utf8').trim();
    if (!content) return '';
    return title ? `\n\n---\n\n## ${title}\n\n${content}` : `\n\n${content}`;
  } catch {
    return '';
  }
}

function assemble(files: readonly PromptFile[]): string {
  return files.map(readPart).join('').replace(/^\n+/, '');
}

export function buildBaselineSystemPrompt(): string {
  return assemble(BASELINE_FILES);
}

export function getPromptStageFiles(stage: PromptStage): PromptFile[] {
  return STAGE_FILES[stage].files;
}

export function buildSystemPrompt(stage: PromptStage): string {
  return assemble(getPromptStageFiles(stage));
}

/** Unicode-aware conservative estimate used by the prompt statistics command. */
export function estimatePromptTokens(prompt: string): number {
  let ascii = 0;
  for (const char of prompt) {
    if (/[\x20-\x7f]/u.test(char)) ascii += 1;
  }
  const nonAscii = [...prompt].length - ascii;
  return Math.ceil(ascii / 4 + nonAscii);
}
