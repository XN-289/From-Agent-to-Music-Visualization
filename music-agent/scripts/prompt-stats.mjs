import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src/lib/harness/prompt-stages.json'), 'utf8'),
);

function baselinePart(part) {
  const relative = path
    .join('music-agent/src/lib/harness', part.file)
    .replaceAll('\\', '/');
  const content = execFileSync('git', ['show', `${manifest.baselineCommit}:${relative}`], {
    encoding: 'utf8',
  }).trim();
  return part.title ? `\n\n---\n\n## ${part.title}\n\n${content}` : `\n\n${content}`;
}

function currentPart(part) {
  const content = readFileSync(
    path.join(process.cwd(), 'src/lib/harness', part.file),
    'utf8',
  ).trim();
  return part.title ? `\n\n---\n\n## ${part.title}\n\n${content}` : `\n\n${content}`;
}

function assemble(parts, readPart) {
  return parts.map(readPart).join('').replace(/^\n+/, '');
}

function estimateTokens(prompt) {
  let ascii = 0;
  let characters = 0;
  for (const char of prompt) {
    characters += 1;
    if (/[\x20-\x7f]/u.test(char)) ascii += 1;
  }
  return Math.ceil(ascii / 4 + (characters - ascii));
}

function rubricResult(prompt, rubric) {
  const missing = rubric.mustContain.filter((marker) => !prompt.includes(marker));
  const forbidden = rubric.mustNotContain.filter((marker) => prompt.includes(marker));
  return {
    case: rubric.case,
    passed: missing.length === 0 && forbidden.length === 0,
    missing,
    forbidden,
  };
}

const baselinePrompt = assemble(manifest.baselineFiles, baselinePart);
const baselineTokens = estimateTokens(baselinePrompt);
const stages = manifest.stageOrder.map((stage) => {
  const definition = manifest.stages[stage];
  const prompt = assemble(definition.files, currentPart);
  const tokens = estimateTokens(prompt);
  return {
    stage,
    label: definition.label,
    files: definition.files.map((part) => part.file),
    promptChars: [...prompt].length,
    estimatedTokens: tokens,
    reducedTokens: baselineTokens - tokens,
    reductionPercent: Number((((baselineTokens - tokens) / baselineTokens) * 100).toFixed(2)),
    qualityRegression: rubricResult(prompt, definition.qualityRegression),
  };
});

const writeSnapshotsDirIndex = process.argv.indexOf('--write-snapshots');
let snapshotHashes;
if (writeSnapshotsDirIndex !== -1) {
  const outputDir = path.resolve(
    process.argv[writeSnapshotsDirIndex + 1] ?? '.',
  );
  mkdirSync(outputDir, { recursive: true });
  snapshotHashes = [
    { stage: 'baseline', prompt: baselinePrompt },
    ...stages.map((stage) => ({
      stage: stage.stage,
      prompt: assemble(manifest.stages[stage.stage].files, currentPart),
    })),
  ].map(({ stage, prompt }) => {
    const file = `${stage}-system-prompt.md`;
    const content = `${prompt.trimEnd()}\n`;
    writeFileSync(path.join(outputDir, file), content);
    return {
      stage,
      file,
      sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
    };
  });
}

const output = {
  baselineCommit: manifest.baselineCommit,
  tokenEstimator:
    'unicode-aware conservative estimate: ceil(ASCII chars / 4) + 1 per non-ASCII char',
  baseline: {
    files: manifest.baselineFiles.map((part) => part.file),
    promptChars: [...baselinePrompt].length,
    estimatedTokens: baselineTokens,
  },
  stages,
  allStagesReduceAtLeastFortyPercent: stages.every((stage) => stage.reductionPercent >= 40),
  allQualityRegressionsPass: stages.every((stage) => stage.qualityRegression.passed),
  ...(snapshotHashes ? { snapshotHashes } : {}),
};

const statsPathIndex = process.argv.indexOf('--write-stats');
if (statsPathIndex !== -1) {
  const statsPath = path.resolve(process.argv[statsPathIndex + 1] ?? 'prompt-stats.json');
  mkdirSync(path.dirname(statsPath), { recursive: true });
  writeFileSync(statsPath, `${JSON.stringify(output, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
