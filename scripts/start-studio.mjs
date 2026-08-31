#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { appendFile, closeSync, openSync } from 'node:fs';
import { SERVICE_DEFS, LOG_ROOT, REPO_ROOT, STUDIO_URL, STATE_FILE } from './studio/constants.mjs';
import { decideStartupMode } from './studio/decisions.mjs';
import { waitForAllServices, waitForServices } from './studio/health.mjs';
import { findProcessSnapshot, getPortOccupants, getProcessList } from './studio/processes.mjs';
import {
  createLogDirectory,
  createRunId,
  createRuntimeState,
  processRecordFromWin32,
  pruneLogDirectories,
  readRuntimeState,
  validateRuntimeStateShape,
  writeRuntimeState,
} from './studio/runtime.mjs';
import { expandRecordedProcessTree, markStateStopped, stopRecordedProcesses } from './studio/stop.mjs';

const MUSIC_AGENT_ENTRY = path.join(REPO_ROOT, 'music-agent', 'node_modules', 'next', 'dist', 'bin', 'next');
const FOLIA_VITE_ENTRY = path.join(REPO_ROOT, 'folia-major', 'node_modules', 'vite', 'bin', 'vite.js');
const FOLIA_ELECTRON = path.join(REPO_ROOT, 'folia-major', 'node_modules', 'electron', 'dist', 'electron.exe');

class StartupAbortError extends Error {}

function parseArgs(argv) {
  return new Set(argv.filter((arg) => arg.startsWith('--')).map((arg) => arg.slice(2)));
}

function log(message) {
  process.stdout.write(`${new Date().toLocaleTimeString()} ${message}\n`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const ports = SERVICE_DEFS.map((service) => service.port);
  const [occupants, previousState] = await Promise.all([
    getPortOccupants(ports),
    readRuntimeState(STATE_FILE),
  ]);
  let currentProcesses = [];
  if (occupants.length > 0) currentProcesses = await getProcessList();

  const decision = decideStartupMode({ occupants, state: previousState, repoRoot: REPO_ROOT, currentProcesses });
  if (decision.mode === 'conflict') throw new StartupAbortError(formatConflict(decision));
  if (decision.mode === 'choose') {
    if (flags.has('reuse')) {
      await reuseHealthyServices(previousState);
      return;
    }
    if (flags.has('restart')) await restartPrevious(previousState, currentProcesses);
    else if ((await chooseReuseOrRestart()) === 'reuse') {
      await reuseHealthyServices(previousState);
      return;
    }
  } else if (decision.mode === 'restart') {
    await restartPrevious(previousState, currentProcesses);
  }

  const finalOccupants = decision.mode === 'start' ? occupants : await getPortOccupants(ports);
  if (finalOccupants.length > 0) throw new StartupAbortError(formatOccupants(finalOccupants));

  await startFresh();
}

async function chooseReuseOrRestart() {
  log('检测到上次启动的健康服务候选。');
  log('  R：复用健康服务');
  log('  S：停止后重启');
  const answer = await readChoice();
  if (answer === 'r') {
    return 'reuse';
  }
  return 'restart';
}

function readChoice() {
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (chunk) => resolve(chunk.trim().toLowerCase()));
  });
}

async function reuseHealthyServices(state) {
  if (!validateRuntimeStateShape(state)) throw new StartupAbortError('运行状态文件格式无效，不能复用');
  try {
    await waitForAllServices();
  } catch (error) {
    throw new StartupAbortError(`上次服务未通过语义健康检查；请运行 停止Studio.cmd 后重试。原因：${error.message}`);
  }
  await writeRuntimeState({ ...state, status: 'running', lastReusedAt: new Date().toISOString() }, STATE_FILE);
  log('已复用健康服务。');
  openStudio();
}

async function restartPrevious(state, currentProcesses) {
  if (!validateRuntimeStateShape(state)) throw new StartupAbortError('运行状态文件格式无效，不能自动停止');
  const details = await stopRecordedProcesses({
    repoRoot: REPO_ROOT,
    state,
    currentProcesses,
  });
  await markStateStopped(STATE_FILE, state, details);
  log(`已停止上次记录的 ${details.stoppedPids.length} 个本仓库进程。`);
}

async function startFresh() {
  const runId = createRunId();
  const logDir = await createLogDirectory(LOG_ROOT, runId);
  const state = createRuntimeState({ runId, repoRoot: REPO_ROOT, logDir });
  await writeRuntimeState(state, STATE_FILE);

  const spawned = new Map();
  try {
    startProcess(spawned, 'music-agent', 'Music Agent', process.execPath, [MUSIC_AGENT_ENTRY, 'dev', '--port', '3003'], path.join(REPO_ROOT, 'music-agent'), logDir, {});
    startProcess(spawned, 'folia-web', 'Folia web', process.execPath, [FOLIA_VITE_ENTRY, '--host', '127.0.0.1', '--port', '3004', '--strictPort'], path.join(REPO_ROOT, 'folia-major'), logDir, {});
    startProcess(spawned, 'electron-dev-server', 'Electron 开发服务', process.execPath, [FOLIA_VITE_ENTRY], path.join(REPO_ROOT, 'folia-major'), logDir, { ELECTRON_DEV: 'true' });

    log('等待基础服务通过语义健康检查...');
    await waitForServices(SERVICE_DEFS.filter((service) => service.id !== 'folia-stage'), {
      isProcessExited: (service) => spawned.get(service.id)?.exited === true,
      onServiceStatus: (service, attempt) => {
        if (attempt.ok) log(`[通过] ${service.label}`);
      },
    });

    startProcess(spawned, 'folia-electron', 'Folia Electron', FOLIA_ELECTRON, ['.'], path.join(REPO_ROOT, 'folia-major'), logDir, { ELECTRON_DEV: 'true' });
    log('等待 Electron、Stage 与全部服务复查...');
    await waitForServices(SERVICE_DEFS, {
      isProcessExited: (service) => {
        return spawned.get(service.id)?.exited === true;
      },
      onServiceStatus: (service, attempt) => {
        if (attempt.ok) log(`[通过] ${service.label}`);
      },
    });

    const processList = await getProcessList();
    const snapshot = findProcessSnapshot(REPO_ROOT, processList, Array.from(spawned.keys()).map((id) => spawned.get(id).pid));
    const runningState = {
      ...state,
      status: 'running',
      processes: snapshot.map(processRecordFromWin32),
      ports: SERVICE_DEFS.map((service) => ({
        id: service.id,
        port: service.port,
        healthUrl: service.healthUrl,
      })),
      healthChecks: SERVICE_DEFS.map((service) => ({
        id: service.id,
        url: service.healthUrl,
        timeoutMs: service.timeoutMs,
        intervalMs: service.intervalMs,
        condition: service.type === 'json'
          ? 'HTTP 200 且 enabled=true、modeEnabled=true、source=stage-api'
          : `HTTP 200 且包含 ${service.requiredMarkers.join(' + ')}`,
      })),
      readyAt: new Date().toISOString(),
    };
    await writeRuntimeState(runningState, STATE_FILE);
    await pruneLogDirectories(LOG_ROOT);
    log(`全部服务已就绪：${STUDIO_URL}`);
    openStudio();
  } catch (error) {
    await failStartup(state, spawned, error);
    throw error;
  }
}

function startProcess(spawned, id, label, command, args, cwd, logDir, env) {
  const stdoutFd = openSync(path.join(logDir, `${id}.out.log`), 'a');
  const stderrFd = openSync(path.join(logDir, `${id}.err.log`), 'a');
  try {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    });
    child.unref();
    const record = { id, label, pid: child.pid, exited: false };
    child.on('exit', () => { record.exited = true; });
    child.on('error', (error) => {
      record.exited = true;
      void appendFile(path.join(logDir, `${id}.err.log`), `spawn error: ${error.stack ?? error.message}\n`, 'utf8');
    });
    spawned.set(id, record);
    log(`[启动] ${label} PID ${child.pid}`);
    return record;
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
}

async function failStartup(state, spawned, error) {
  const currentProcesses = await safelyGetProcesses();
  const recorded = Array.from(spawned.values()).map((record) => ({ pid: record.pid }));
  const expandedRecorded = expandRecordedProcessTree(REPO_ROOT, recorded, currentProcesses);
  const details = await stopRecordedProcesses({
    repoRoot: REPO_ROOT,
    state: { processes: expandedRecorded },
    currentProcesses,
  });
  const failedState = {
    ...state,
    status: 'failed',
    failure: {
      message: error.stack ?? error.message,
      stoppedPids: details.stoppedPids,
      skipped: details.skipped,
    },
    failedAt: new Date().toISOString(),
  };
  await writeRuntimeState(failedState, STATE_FILE);
  await pruneLogDirectories(LOG_ROOT);
  log(`[失败] ${error.message}`);
  log(`日志目录：${state.logDir}`);
  log('可选动作：重试=再次运行 启动Studio.cmd；打开日志=在资源管理器打开上述目录；停止全部=运行 停止Studio.cmd');
}

async function safelyGetProcesses() {
  try {
    return await getProcessList();
  } catch {
    return [];
  }
}

function formatConflict(decision) {
  const lines = ['端口预检未通过：'];
  if (decision.reason) lines.push(`原因：${decision.reason}`);
  for (const item of decision.unknownOccupants ?? []) {
    const occupant = item.occupant;
    lines.push(`端口 ${occupant.Port}：PID ${occupant.Pid} / ${occupant.Name ?? '未知进程'} / ${occupant.CommandLine ?? '未知命令行'}`);
  }
  lines.push('脚本不会结束未知进程。请先确认并手动关闭占用者，再重新启动。');
  return lines.join('\n');
}

function formatOccupants(occupants) {
  const lines = ['停止上次服务后端口仍被占用：'];
  for (const occupant of occupants) {
    lines.push(`端口 ${occupant.Port}：PID ${occupant.Pid} / ${occupant.Name ?? '未知进程'} / ${occupant.CommandLine ?? '未知命令行'}`);
  }
  return lines.join('\n');
}

function openStudio() {
  const child = spawn('cmd.exe', ['/c', 'start', '', STUDIO_URL], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

main().catch((error) => {
  if (!(error instanceof StartupAbortError)) console.error(error);
  else process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
