#!/usr/bin/env node
import { REPO_ROOT, STATE_FILE } from './studio/constants.mjs';
import { getProcessList } from './studio/processes.mjs';
import { readRuntimeState, validateRuntimeStateShape } from './studio/runtime.mjs';
import { markStateStopped, stopRecordedProcesses } from './studio/stop.mjs';

async function main() {
  const state = await readRuntimeState(STATE_FILE);
  if (!state) {
    process.stdout.write('没有找到 .runtime/studio-services.json，脚本不会结束任何进程。\n');
    return;
  }
  if (!validateRuntimeStateShape(state)) {
    throw new Error('运行状态文件格式无效；为避免误杀进程，脚本不会停止服务。');
  }

  const currentProcesses = await getProcessList();
  const details = await stopRecordedProcesses({
    repoRoot: REPO_ROOT,
    state,
    currentProcesses,
  });
  const stoppedState = await markStateStopped(STATE_FILE, state, details);
  process.stdout.write(`已停止 ${details.stoppedPids.length} 个仍归属本仓库的记录进程。\n`);
  for (const item of details.skipped) {
    process.stdout.write(`跳过 PID ${item.pid}：${item.reason}。\n`);
  }
  process.stdout.write(`状态：${stoppedState.status}；日志：${state.logDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
