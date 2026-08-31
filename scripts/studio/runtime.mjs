import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LOG_RUNS_TO_KEEP, STATE_SCHEMA_VERSION } from './constants.mjs';

const RUN_ID_PATTERN = /^\d{8}T\d{6}-[0-9a-f]{8}$/;

export function createRunId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function processRecordFromWin32(record) {
  return {
    pid: Number(record.ProcessId),
    parentPid: Number(record.ParentProcessId),
    name: record.Name,
    commandLine: record.CommandLine,
    executablePath: record.ExecutablePath,
  };
}

export function createRuntimeState({ runId, repoRoot, logDir, processes = [] }) {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    status: 'starting',
    runId,
    workspace: repoRoot,
    startedAt: new Date().toISOString(),
    processes,
    ports: [],
    healthChecks: [],
    logDir,
    failure: null,
  };
}

export async function writeRuntimeState(state, stateFile) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rm(stateFile, { force: true });
  await fs.rename(temporary, stateFile);
}

export async function readRuntimeState(stateFile) {
  try {
    return JSON.parse(await fs.readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function createLogDirectory(logRoot, runId) {
  const logDir = path.join(logRoot, runId);
  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(path.join(logDir, '.studio-run'), `${runId}\n`, 'utf8');
  return logDir;
}

export async function pruneLogDirectories(logRoot, keep = LOG_RUNS_TO_KEEP) {
  await fs.mkdir(logRoot, { recursive: true });
  const entries = await fs.readdir(logRoot, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) continue;
    const marker = path.join(logRoot, entry.name, '.studio-run');
    try {
      await fs.access(marker);
    } catch {
      continue;
    }
    candidates.push({ name: entry.name, mtime: (await fs.stat(marker)).mtimeMs });
  }

  candidates.sort((a, b) => b.name.localeCompare(a.name, 'en'));
  for (const candidate of candidates.slice(keep)) {
    await fs.rm(path.join(logRoot, candidate.name), { recursive: true, force: true });
  }
  return candidates.slice(keep).map((candidate) => candidate.name);
}

export function validateRuntimeStateShape(state) {
  return (
    typeof state === 'object' && state !== null &&
    state.schemaVersion === STATE_SCHEMA_VERSION &&
    typeof state.runId === 'string' && RUN_ID_PATTERN.test(state.runId) &&
    typeof state.workspace === 'string' &&
    Array.isArray(state.processes) &&
    state.processes.every((processRecord) => Number.isInteger(processRecord.pid)) &&
    Array.isArray(state.ports)
  );
}
