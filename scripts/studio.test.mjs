import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SERVICE_DEFS } from './studio/constants.mjs';
import { decideStartupMode } from './studio/decisions.mjs';
import { validateServiceResponse, waitForServices, waitForService } from './studio/health.mjs';
import { belongsToRepository, findProcessSnapshot, parsePowerShellJson } from './studio/processes.mjs';
import {
  createLogDirectory,
  createRuntimeState,
  pruneLogDirectories,
  validateRuntimeStateShape,
} from './studio/runtime.mjs';
import { expandRecordedProcessTree, stopRecordedProcesses } from './studio/stop.mjs';

const REPO = 'D:/studio-workspace';

test('服务常量覆盖四个必需端口和语义条件', () => {
  assert.deepEqual(
    SERVICE_DEFS.map((service) => service.port).sort((a, b) => a - b),
    [3000, 3003, 3004, 32107],
  );
  assert.ok(SERVICE_DEFS.every((service) => service.healthUrl.startsWith('http://127.0.0.1:')));
  assert.ok(SERVICE_DEFS.every((service) => service.timeoutMs > 0 && service.intervalMs > 0));
});

test('端口空闲时直接冷启动', () => {
  assert.equal(decideStartupMode({ occupants: [], state: null, repoRoot: REPO }).mode, 'start');
});

test('未知端口占用会被拒绝而不是接管', () => {
  const decision = decideStartupMode({
    occupants: [{ Port: 3003, Pid: 999 }],
    state: null,
    repoRoot: REPO,
    currentProcesses: [],
  });
  assert.equal(decision.mode, 'conflict');
  assert.equal(decision.unknownOccupants.length, 1);
});

test('四个端口都由状态记录的本仓库进程占用时提供复用或重启', () => {
  const state = { status: 'running', processes: [{ pid: 10 }, { pid: 11 }, { pid: 12 }, { pid: 13 }] };
  const occupants = SERVICE_DEFS.map((service, index) => ({
    Port: service.port,
    Pid: 10 + index,
  }));
  const currentProcesses = occupants.map((occupant) => ({
    ProcessId: occupant.Pid,
    CommandLine: `node D:\\studio-workspace\\service-${occupant.Pid}.js`,
  }));
  const decision = decideStartupMode({ occupants, state, repoRoot: REPO, currentProcesses });
  assert.equal(decision.mode, 'choose');
  assert.equal(decision.reusable, true);
});

test('部分上次服务存在时只允许停止后重启', () => {
  const state = { status: 'running', processes: [{ pid: 10 }] };
  const occupants = [{ Port: 3003, Pid: 10 }];
  const currentProcesses = [{ ProcessId: 10, CommandLine: 'node D:\\studio-workspace\\next' }];
  const decision = decideStartupMode({ occupants, state, repoRoot: REPO, currentProcesses });
  assert.equal(decision.mode, 'restart');
  assert.equal(decision.reusable, false);
});

test('健康检查必须命中 HTML 或 Stage JSON 语义', () => {
  const htmlService = SERVICE_DEFS.find((service) => service.id === 'folia-web');
  const stageService = SERVICE_DEFS.find((service) => service.id === 'folia-stage');

  assert.equal(validateServiceResponse(htmlService, { status: 200 }, '<!doctype html><div id="root">Folia</div>'), null);
  assert.equal(validateServiceResponse(htmlService, { status: 200 }, '<!DOCTYPE html><div id="root">Folia</div>'), null);
  assert.match(validateServiceResponse(htmlService, { status: 200 }, '<!doctype html>empty'), /缺少语义标记/);
  assert.equal(
    validateServiceResponse(stageService, { status: 200 }, JSON.stringify({ enabled: true, modeEnabled: true, source: 'stage-api' })),
    null,
  );
  assert.match(
    validateServiceResponse(stageService, { status: 200 }, JSON.stringify({ enabled: false, modeEnabled: true, source: 'stage-api' })),
    /enabled/,
  );
});

test('进程退出会让健康检查立即失败', async () => {
  const service = SERVICE_DEFS.find((item) => item.id === 'music-agent');
  await assert.rejects(
    waitForService(service, {
      timeoutMs: 100,
      intervalMs: 1,
      isProcessExited: () => true,
      fetchImpl: async () => ({ status: 200, text: async () => '<!doctype html>Music Agent __next' }),
    }),
    /进程在健康检查通过前退出/,
  );
});

test('批量健康检查把服务定义传给进程退出回调', async () => {
  const services = SERVICE_DEFS.filter((service) => service.id === 'folia-web');
  const seen = [];
  await assert.rejects(
    waitForServices(services, {
      timeoutMs: 10,
      intervalMs: 1,
      isProcessExited: (service) => {
        seen.push(service.id);
        return true;
      },
      fetchImpl: async () => ({ status: 200, text: async () => '<!doctype html>' }),
    }),
    /进程在健康检查通过前退出/,
  );
  assert.deepEqual(seen, ['folia-web']);
});

test('PowerShell 单对象输出会归一为数组且仓库归属大小写不敏感', () => {
  assert.equal(parsePowerShellJson('{"ProcessId":1}').length, 1);
  assert.equal(belongsToRepository({ CommandLine: 'node D:\\STUDIO-WORKSPACE\\app.js' }, REPO), true);
  assert.equal(belongsToRepository({ CommandLine: 'node D:\\other\\app.js' }, REPO), false);
});

test('停止只处理记录进程树中仍归属仓库的 PID', async () => {
  const currentProcesses = [
    { ProcessId: 10, ParentProcessId: 1, CommandLine: 'node D:\\studio-workspace\\root.js' },
    { ProcessId: 11, ParentProcessId: 10, CommandLine: 'node D:\\studio-workspace\\child.js' },
    { ProcessId: 12, ParentProcessId: 10, CommandLine: 'node D:\\other\\unowned.js' },
    { ProcessId: 20, ParentProcessId: 1, CommandLine: 'node D:\\other\\recorded.js' },
  ];
  const snapshot = findProcessSnapshot(REPO, currentProcesses, [10]);
  assert.deepEqual(snapshot.map((record) => Number(record.ProcessId)), [10, 11]);

  const recorded = expandRecordedProcessTree(REPO, [{ pid: 10 }, { pid: 20 }], currentProcesses);
  const killed = [];
  const details = await stopRecordedProcesses({
    repoRoot: REPO,
    state: { processes: [...recorded, { pid: 20 }] },
    currentProcesses,
    kill: async (pid) => killed.push(pid),
  });
  assert.deepEqual(killed, [11, 10]);
  assert.deepEqual(details.skipped, [{ pid: 20, reason: '当前命令行不再属于本仓库' }]);
});

test('运行状态包含 schema、runId、进程和日志路径', () => {
  const state = createRuntimeState({
    runId: '20260831T120000-00112233',
    repoRoot: REPO,
    logDir: `${REPO}/.runtime/logs/20260831T120000-00112233`,
    processes: [{ pid: 10 }],
  });
  assert.equal(validateRuntimeStateShape(state), true);
  assert.equal(validateRuntimeStateShape({ ...state, schemaVersion: 99 }), false);
});

test('日志清理只删除带标记的启动目录并保留最近十次', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-runtime-'));
  try {
    for (let index = 0; index < 12; index += 1) {
      const runId = `20260831T${String(index).padStart(6, '0')}-${String(index).padStart(8, '0')}`;
      const logDir = await createLogDirectory(root, runId);
      await writeFile(path.join(logDir, 'service.log'), `run-${index}\n`, 'utf8');
    }
    const unrelated = path.join(root, 'not-a-studio-run');
    await createLogDirectory(root, 'not-a-studio-run');
    await createLogDirectory(root, '20260831T999999-ffffffff');
    await rm(path.join(root, '20260831T999999-ffffffff', '.studio-run'), { force: true });
    await rm(unrelated, { recursive: true, force: true });
    await writeFile(unrelated, 'keep\n', 'utf8');

    const removed = await pruneLogDirectories(root, 10);
    assert.deepEqual(removed.sort(), [
      '20260831T000000-00000000',
      '20260831T000001-00000001',
    ]);
    await stat(unrelated);
    await stat(path.join(root, '20260831T000011-00000011'));
    await stat(path.join(root, '20260831T999999-ffffffff'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
