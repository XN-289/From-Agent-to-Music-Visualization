import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const foliaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(foliaRoot, '..');
const evidenceRoot = path.join(repoRoot, 'tasks', 'us-007-evidence');
const stagePort = 32108;
const stageToken = 'us007-stage-token';
const stageBaseUrl = `http://127.0.0.1:${stagePort}`;
const musicAgentBaseUrl = 'http://127.0.0.1:3006';
const songId = 'bbcae587-6a94-4492-9fb3-3c348a9224ae';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForStageHealth() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(`${stageBaseUrl}/stage/health`);
            if (response.ok) {
                return await response.json();
            }
        } catch {
            // Keep polling until the temporary Stage API is ready.
        }
        await delay(100);
    }
    throw new Error('Temporary Stage API did not become healthy');
}

async function pushRecipeSong() {
    const response = await fetch(`${musicAgentBaseUrl}/api/songs/${songId}/push-folia`, {
        method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
        throw new Error(`Music Agent push failed: HTTP ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload.stage.stage.mediaSession;
}

const readAppearance = (page) => page.evaluate(() => {
    const host = Array.from(document.querySelectorAll('body *'))
        .find((element) => getComputedStyle(element).getPropertyValue('--text-primary').trim());
    const style = getComputedStyle(host ?? document.body);
    const audio = Array.from(document.querySelectorAll('audio'))
        .map((element) => ({
            src: element.currentSrc || element.src,
            attributeSrc: element.getAttribute('src'),
            readyState: element.readyState,
            networkState: element.networkState,
            paused: element.paused,
            currentTime: element.currentTime,
            duration: element.duration,
        }));

    return {
        bg: style.getPropertyValue('--bg-color').trim().toLowerCase(),
        primary: style.getPropertyValue('--text-primary').trim().toLowerCase(),
        secondary: style.getPropertyValue('--text-secondary').trim().toLowerCase(),
        accent: style.getPropertyValue('--text-accent').trim().toLowerCase(),
        hasSongTitle: document.body.innerText.includes('US007 Song A Recipe'),
        hasFirstLyric: document.body.innerText.includes('灯亮的时候'),
        isStageAudio: audio.some((item) => item.src.includes('/stage/media/current/audio')),
        audio,
        stageAudioIsActive: audio.some((item) => item.src.includes('/stage/media/current/audio') && (!item.paused || item.currentTime > 0)),
        daylightPreference: localStorage.getItem('default_theme_daylight'),
        animationPreference: localStorage.getItem('theme_animation_intensity'),
    };
});

async function main() {
    await fs.mkdir(evidenceRoot, { recursive: true });
    const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'us007-disconnect-'));
    const stageProcess = spawn(
        process.execPath,
        [
            'test/manual/stage-api-dev.cjs',
            '--port',
            String(stagePort),
            '--token',
            stageToken,
        ],
        { cwd: foliaRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    stageProcess.stdout.on('data', () => {});
    stageProcess.stderr.on('data', () => {});

    let browser;
    const samples = [];
    try {
        await waitForStageHealth();
        const mediaSession = await pushRecipeSong();

        browser = await chromium.launch({
            headless: true,
        });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
        });
        await context.addInitScript(() => {
            localStorage.setItem('default_theme_daylight', 'true');
            localStorage.removeItem('theme_animation_intensity');
        });
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:3004', { waitUntil: 'domcontentloaded' });

        let recipeActive;
        const recipeDeadline = Date.now() + 20000;
        do {
            recipeActive = await readAppearance(page);
            if (
                recipeActive.primary === '#2ee6ff'
                && recipeActive.secondary === '#d3e2ff'
                && recipeActive.accent === '#ff5fae'
                && recipeActive.isStageAudio
            ) {
                break;
            }
            await delay(250);
        } while (Date.now() < recipeDeadline);

        if (
            recipeActive.primary !== '#2ee6ff'
            || recipeActive.secondary !== '#d3e2ff'
            || recipeActive.accent !== '#ff5fae'
            || !recipeActive.isStageAudio
        ) {
            throw new Error(`Recipe did not become active: ${JSON.stringify(recipeActive)}`);
        }

        const recipeActiveAt = Date.now();
        await page.screenshot({
            path: path.join(evidenceRoot, 'stage-disconnect-recipe-active.png'),
        });
        samples.push({ phase: 'recipe-active', atMs: recipeActiveAt, appearance: recipeActive });

        const stoppedAt = Date.now();
        stageProcess.kill('SIGTERM');
        let stageExitCode = null;
        const stageExited = new Promise((resolve) => {
            stageProcess.once('exit', (code) => {
                stageExitCode = code;
                resolve();
            });
        });
        await Promise.race([stageExited, delay(5000)]);

        let restored = null;
        let lastAppearanceAfterDisconnect = null;
        const restoreDeadline = Date.now() + 15000;
        do {
            const appearance = await readAppearance(page);
            lastAppearanceAfterDisconnect = appearance;
            samples.push({ phase: 'after-disconnect', atMs: Date.now(), appearance });
            if (
                appearance.bg === '#f5f5f4'
                && appearance.primary === '#1c1917'
                && appearance.secondary === '#44403c'
                && appearance.accent === '#ea580c'
                && !appearance.stageAudioIsActive
                && !appearance.hasFirstLyric
                && appearance.animationPreference === null
            ) {
                restored = appearance;
                break;
            }
            await delay(250);
        } while (Date.now() < restoreDeadline);

        if (!restored) {
            const failure = {
                ok: false,
                songId,
                stageSessionId: mediaSession.id,
                stageUpdatedAt: mediaSession.updatedAt,
                stoppedAt,
                lastAppearanceAfterDisconnect,
                samples,
            };
            await fs.writeFile(
                path.join(evidenceRoot, 'stage-disconnect-failed.json'),
                `${JSON.stringify(failure, null, 2)}\n`,
                'utf8',
            );
            throw new Error(`Local appearance did not restore: ${JSON.stringify(lastAppearanceAfterDisconnect)}`);
        }

        const restoredAt = Date.now();
        await page.screenshot({
            path: path.join(evidenceRoot, 'stage-disconnect-restored.png'),
        });
        await context.close();

        const result = {
            ok: true,
            songId,
            stageSessionId: mediaSession.id,
            stageUpdatedAt: mediaSession.updatedAt,
            recipe: mediaSession.visualConfig,
            recipeActiveAt,
            stageStoppedAt: stoppedAt,
            stageExitCode,
            restoredAt,
            restoreElapsedMs: restoredAt - stoppedAt,
            recipeActive,
            restored,
            samples,
        };
        await fs.writeFile(
            path.join(evidenceRoot, 'stage-disconnect.json'),
            `${JSON.stringify(result, null, 2)}\n`,
            'utf8',
        );
        console.log(JSON.stringify(result, null, 2));
    } finally {
        if (browser) {
            await browser.close();
        }
        if (stageProcess.exitCode === null) {
            stageProcess.kill('SIGTERM');
        }
        await fs.rm(profileDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
});
