const fs = require('fs');
const path = require('path');
const { createStageApi } = require('../../electron/stageApi.cjs');

const DEFAULT_PORT = 32107;

function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, syncEnv: false, smoke: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--port' && argv[i + 1]) {
      args.port = Number(argv[++i]);
    } else if (value === '--sync-env') {
      args.syncEnv = true;
    } else if (value === '--smoke') {
      args.smoke = true;
    }
  }
  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error(`Invalid --port: ${args.port}`);
  }
  return args;
}

function maskToken(token) {
  if (!token) return '<none>';
  if (token.length <= 8) return `${token.slice(0, 2)}***`;
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}

function updateEnvToken(musicAgentRoot, token) {
  const envPath = path.join(musicAgentRoot, '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}; run --sync-env only after Music Agent is cloned.`);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const key = 'FOLIA_STAGE_TOKEN=';
  const next = content.includes(key)
    ? content.replace(/^FOLIA_STAGE_TOKEN=.*$/m, `${key}${token}`)
    : `${content.replace(/\s*$/, '\n')}${key}${token}\n`;
  fs.writeFileSync(envPath, next, 'utf8');
}

function createMemoryStore(port) {
  const values = new Map();
  values.set('STAGE_API_PORT', port);
  return {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
    has: (key) => values.has(key),
  };
}

async function smokeSession(baseUrl, token) {
  const fixtureRoot = path.join(__dirname, 'stage-client', 'fixtures');
  const audioPath = path.join(fixtureRoot, 'stage-demo-tone.wav');
  const lyricsPath = path.join(fixtureRoot, 'stage-demo.lrc');

  // 1x1 transparent PNG, enough to prove the cover multipart field survives Stage validation.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  const form = new FormData();
  form.set('title', 'Music Agent Stage Dev Smoke');
  form.set('artist', 'Music Agent');
  form.set('album', 'Music Agent');
  form.set('lyricsFormat', 'lrc');
  form.set('audioFile', new Blob([fs.readFileSync(audioPath)], { type: 'audio/wav' }), 'stage-demo-tone.wav');
  form.set('lyricsFile', new Blob([fs.readFileSync(lyricsPath)], { type: 'text/plain; charset=utf-8' }), 'stage-demo.lrc');
  form.set('coverFile', new Blob([png], { type: 'image/png' }), 'stage-demo-cover.png');

  const res = await fetch(`${baseUrl}/stage/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    activeEntryKind: payload?.activeEntryKind ?? null,
    mediaSession: payload?.mediaSession ?? null,
    error: payload?.error ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stageApi = createStageApi({
    app: {
      getPath: (name) => {
        if (name === 'userData') {
          const dir = path.join(process.cwd(), '.stage-api-dev');
          fs.mkdirSync(dir, { recursive: true });
          return dir;
        }
        return process.cwd();
      },
    },
    store: createMemoryStore(args.port),
    getMainWindow: () => null,
    stageModeEnabledSettingKey: 'STAGE_MODE_ENABLED',
    stageModeSourceSettingKey: 'STAGE_MODE_SOURCE',
    stageApiTokenSettingKey: 'STAGE_API_TOKEN',
    stageApiPortSettingKey: 'STAGE_API_PORT',
    defaultStageApiPort: args.port,
    getNeteasePort: () => null,
  });

  const status = await stageApi.setStageEnabled(true);
  const baseUrl = `http://127.0.0.1:${status.port}`;
  console.log(`[stage-api-dev] listening=${baseUrl}`);
  console.log(`[stage-api-dev] enabled=${status.enabled}`);
  console.log(`[stage-api-dev] token=${maskToken(status.token)}`);

  if (args.syncEnv) {
    const musicAgentRoot = path.resolve(__dirname, '..', '..', '..', 'music-agent');
    updateEnvToken(musicAgentRoot, status.token);
    console.log('[stage-api-dev] synced FOLIA_STAGE_TOKEN to music-agent/.env.local');
  }

  if (!args.smoke) {
    const stop = async () => {
      await stageApi.stopStageServer();
      process.exit(0);
    };
    process.on('SIGINT', () => void stop());
    process.on('SIGTERM', () => void stop());
    return;
  }

  const health = await fetch(`${baseUrl}/stage/health`).then((res) => res.json());
  const session = await smokeSession(baseUrl, status.token);
  console.log('[stage-api-dev] health=' + JSON.stringify(health));
  console.log('[stage-api-dev] session=' + JSON.stringify(session));
  await stageApi.stopStageServer();
  if (!session.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[stage-api-dev] failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
