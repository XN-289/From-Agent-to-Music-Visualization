import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../folia-major/node_modules/playwright/index.mjs';

const evidenceRoot = path.dirname(fileURLToPath(import.meta.url));
const musicAgentUrl = 'http://127.0.0.1:3003';
const foliaWebUrl = 'http://127.0.0.1:3004';
const stageHealthUrl = 'http://127.0.0.1:32107/stage/health';
const songId = '432cd78d-2026-4733-8da8-cd9d3e6bae66';
const segmentStartMs = 53_218;
const segmentEndMs = 61_218;
const screenshotTargetsMs = [54_200, 56_200, 58_200];

const recipes = [
  {
    id: 'livehouse',
    name: 'Livehouse 现场',
    cue: '舞台灯、颗粒感、人群能量',
    intensity: 84,
    temperature: 12,
    chorusImpact: 92,
    primary: '#f97316',
  },
  {
    id: 'rain-window',
    name: '雨窗民谣',
    cue: '低饱和、柔光、雨夜玻璃',
    intensity: 38,
    temperature: -8,
    chorusImpact: 44,
    primary: '#67e8f9',
  },
  {
    id: 'neon-night',
    name: '夏夜霓虹',
    cue: '霓虹、潮湿路面、副歌炸开',
    intensity: 72,
    temperature: 4,
    chorusImpact: 76,
    primary: '#2ee6ff',
  },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHttp(url, label) {
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${label} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`${label} unavailable: ${lastError?.message ?? 'unknown error'}`);
}

async function readAppearance(page) {
  return page.evaluate(() => {
    const host = Array.from(document.querySelectorAll('body *'))
      .find((element) => getComputedStyle(element).getPropertyValue('--text-primary').trim());
    const style = getComputedStyle(host ?? document.body);
    const audio = Array.from(document.querySelectorAll('audio')).map((element) => ({
      src: element.currentSrc || element.src || '',
      paused: element.paused,
      currentTime: element.currentTime,
      readyState: element.readyState,
    }));
    return {
      primary: style.getPropertyValue('--text-primary').trim().toLowerCase(),
      secondary: style.getPropertyValue('--text-secondary').trim().toLowerCase(),
      accent: style.getPropertyValue('--text-accent').trim().toLowerCase(),
      hasStageAudio: audio.some((item) => item.src.includes('/stage/media/current/audio')),
      stageAudio: audio.find((item) => item.src.includes('/stage/media/current/audio')) ?? null,
      bodyText: document.body.innerText,
    };
  });
}

async function saveRecipe(recipe) {
  const response = await fetch(`${musicAgentUrl}/api/songs/${songId}/visual-recipe`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipe }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Save ${recipe.id} failed: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.recipe;
}

async function pushSong() {
  const response = await fetch(`${musicAgentUrl}/api/songs/${songId}/push-folia`, { method: 'POST' });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Push failed: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.stage.stage.mediaSession;
}

async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function captureRecipe(browser, recipe, index) {
  const savedRecipe = await saveRecipe(recipe);
  const mediaSession = await pushSong();
  if (!mediaSession.visualConfig?.theme?.dark?.primaryColor) {
    throw new Error(`Stage did not return visualConfig for ${recipe.id}`);
  }
  if (mediaSession.visualConfig.theme.dark.primaryColor.toLowerCase() !== recipe.primary) {
    throw new Error(`Unexpected Stage primary for ${recipe.id}: ${mediaSession.visualConfig.theme.dark.primaryColor}`);
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto(foliaWebUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('button', { name: /我知道了/ }).click({ timeout: 5_000 }).catch(() => {});

  let appearance = null;
  const deadline = Date.now() + 25_000;
  do {
    appearance = await readAppearance(page);
    if (
      appearance.hasStageAudio
      && appearance.primary === recipe.primary
    ) break;
    await delay(250);
  } while (Date.now() < deadline);

  if (
    !appearance
    || !appearance.hasStageAudio
    || appearance.primary !== recipe.primary
  ) {
    throw new Error(`Recipe ${recipe.id} did not become active: ${JSON.stringify(appearance)}`);
  }

  const beforePlay = await page.evaluate(async (startMs) => {
    const audio = Array.from(document.querySelectorAll('audio'))
      .find((element) => (element.currentSrc || element.src).includes('/stage/media/current/audio'));
    if (!audio) throw new Error('Stage audio element is missing');
    audio.pause();
    audio.currentTime = startMs / 1000;
    audio.muted = false;
    await audio.play();
    return {
      currentTime: audio.currentTime,
      paused: audio.paused,
      readyState: audio.readyState,
    };
  }, segmentStartMs);

  const screenshots = [];
  for (const targetMs of screenshotTargetsMs) {
    await page.waitForFunction(
      (target) => {
        const audio = Array.from(document.querySelectorAll('audio'))
          .find((element) => (element.currentSrc || element.src).includes('/stage/media/current/audio'));
        return Boolean(audio && !audio.paused && audio.currentTime * 1000 >= target);
      },
      targetMs,
      { timeout: 10_000 },
    );
    const fileName = `${recipe.id}-${String(targetMs).padStart(6, '0')}ms.png`;
    const filePath = path.join(evidenceRoot, fileName);
    const actualAudioMs = await page.evaluate(() => {
      const audio = Array.from(document.querySelectorAll('audio'))
        .find((element) => (element.currentSrc || element.src).includes('/stage/media/current/audio'));
      return Math.round((audio?.currentTime ?? 0) * 1000);
    });
    await page.screenshot({ path: filePath });
    screenshots.push({
      targetMs,
      actualAudioMs,
      file: fileName,
      sha256: await sha256(filePath),
    });
  }

  const afterScreenshots = await readAppearance(page);
  await page.evaluate(() => {
    const audio = Array.from(document.querySelectorAll('audio'))
      .find((element) => (element.currentSrc || element.src).includes('/stage/media/current/audio'));
    audio?.pause();
  });
  await context.close();

  return {
    order: index + 1,
    recipe: savedRecipe,
    expectation: {
      name: recipe.name,
      cue: recipe.cue,
    },
    stageSessionId: mediaSession.id,
    stageUpdatedAt: mediaSession.updatedAt,
    visualConfig: mediaSession.visualConfig,
    playback: {
      segmentStartMs,
      segmentEndMs,
      beforePlay,
      afterScreenshots: {
        primary: afterScreenshots.primary,
        stageAudioMs: Math.round((afterScreenshots.stageAudio?.currentTime ?? 0) * 1000),
        paused: afterScreenshots.stageAudio?.paused ?? null,
      },
    },
    screenshots,
  };
}

async function writeReview(results) {
  const columns = screenshotTargetsMs
    .map((targetMs) => `<th>${(targetMs / 1000).toFixed(1)}s</th>`)
    .join('');
  const rows = results.map((result) => `
        <tr>
          <th>
            <span>${result.expectation.name}</span>
            <small>${result.expectation.cue}</small>
            <code>${JSON.stringify(result.recipe)}</code>
          </th>
          ${screenshotTargetsMs.map((targetMs) => {
            const shot = result.screenshots.find((item) => item.targetMs === targetMs);
            return `<td><img src="${shot.file}" alt="${result.expectation.name} at ${(targetMs / 1000).toFixed(1)} seconds"></td>`;
          }).join('')}
        </tr>`.trim()).join('');

  const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>US-008 三配方审片表</title>
<style>
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #101214; color: #f4f4f5; }
  header { padding: 20px 24px 12px; }
  h1 { margin: 0 0 6px; font-size: 20px; }
  p { margin: 4px 0; color: #a1a1aa; }
  main { padding: 0 24px 24px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 1080px; }
  th, td { padding: 10px; border: 1px solid #27272a; text-align: left; vertical-align: top; }
  th { width: 220px; }
  small { display: block; margin-top: 4px; color: #a1a1aa; }
  code { display: block; margin-top: 8px; white-space: pre-wrap; color: #d8faf7; }
  img { display: block; width: 320px; aspect-ratio: 16 / 9; object-fit: cover; background: #000; }
</style>
<header>
  <h1>US-008 三配方审片表</h1>
  <p>同一真实歌《神降・天火》，副歌段 53.218–61.218s，viewport 1280×720。</p>
  <p>静态帧用于同轴对比；最终结论请结合 Folia 实际播放画面给出“通过 / 继续调整”。</p>
</header>
<main>
  <table>
    <thead><tr><th>配方</th>${columns}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</main>
</html>`;
  await fs.writeFile(path.join(evidenceRoot, 'review.html'), html, 'utf8');
}

async function main() {
  await waitForHttp(`${musicAgentUrl}/studio`, 'Music Agent');
  await waitForHttp(foliaWebUrl, 'Folia web');
  const stageHealth = await (await waitForHttp(stageHealthUrl, 'Folia Stage')).json();
  if (stageHealth.source !== 'stage-api' || stageHealth.enabled !== true) {
    throw new Error(`Stage is not in stage-api mode: ${JSON.stringify(stageHealth)}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const results = [];
  try {
    for (const [index, recipe] of recipes.entries()) {
      results.push(await captureRecipe(browser, recipe, index));
    }
    const evidence = {
      generatedAt: new Date().toISOString(),
      songId,
      songTitle: '神降・天火',
      order: recipes.map((recipe) => recipe.id),
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1, colorScheme: 'dark' },
      segmentStartMs,
      segmentEndMs,
      systemBrightness: 'not changed by this script',
      results,
    };
    await fs.writeFile(
      path.join(evidenceRoot, 'machine-review.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    await writeReview(results);
    console.log(JSON.stringify({
      ok: true,
      songId,
      recipes: results.map((result) => ({
        id: result.recipe.id,
        stageSessionId: result.stageSessionId,
        screenshots: result.screenshots.map((item) => item.file),
      })),
      review: path.join(evidenceRoot, 'review.html'),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
