import { promises as fs } from 'node:fs';
import { findProcessSnapshot } from './processes.mjs';

export function expandRecordedProcessTree(repoRoot, recordedProcesses, currentProcesses) {
  const rootPids = recordedProcesses.map((record) => Number(record.pid)).filter(Number.isInteger);
  return findProcessSnapshot(repoRoot, currentProcesses, rootPids)
    .map((record) => ({ pid: Number(record.ProcessId) }));
}

export async function stopRecordedProcesses({ repoRoot, state, currentProcesses, kill = terminatePid }) {
  const safePids = [];
  const skipped = [];
  const currentByPid = new Map(currentProcesses.map((record) => [Number(record.ProcessId), record]));

  for (const recorded of state.processes ?? []) {
    const pid = Number(recorded.pid);
    const current = currentByPid.get(pid);
    if (!current) continue;
    if (!isOwnedProcess(repoRoot, current)) {
      skipped.push({ pid, reason: '当前命令行不再属于本仓库' });
      continue;
    }
    safePids.push(pid);
  }

  for (const pid of safePids.sort((a, b) => b - a)) {
    await kill(pid);
  }

  return { stoppedPids: safePids, skipped };
}

function isOwnedProcess(repoRoot, processRecord) {
  const root = repoRoot.replaceAll('\\', '/').toLowerCase();
  return [processRecord.CommandLine, processRecord.ExecutablePath].some((value) => {
    return typeof value === 'string' && value.replaceAll('\\', '/').toLowerCase().includes(root);
  });
}

export function terminatePid(pid) {
  try {
    process.kill(pid);
    return Promise.resolve();
  } catch (error) {
    if (error.code === 'ESRCH') return Promise.resolve();
    return Promise.reject(error);
  }
}

export async function markStateStopped(stateFile, state, details) {
  const stoppedState = {
    ...state,
    status: 'stopped',
    stoppedAt: new Date().toISOString(),
    stopDetails: details,
  };
  await fs.writeFile(stateFile, `${JSON.stringify(stoppedState, null, 2)}\n`, 'utf8');
  return stoppedState;
}
