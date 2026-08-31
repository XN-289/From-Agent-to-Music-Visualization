import { SERVICE_DEFS } from './constants.mjs';
import { belongsToRepository } from './processes.mjs';

export function decideStartupMode({ occupants, state, repoRoot, currentProcesses = [] }) {
  const occupiedByPort = groupOccupantsByPort(occupants);
  const occupiedPorts = new Set(occupiedByPort.keys());
  const allRequiredOccupied = SERVICE_DEFS.every((service) => occupiedPorts.has(service.port));

  if (occupiedPorts.size === 0) {
    return { mode: 'start', reusable: false };
  }

  const processByPid = new Map(currentProcesses.map((record) => [Number(record.ProcessId), record]));
  if (!state) {
    const unknownOccupants = SERVICE_DEFS.flatMap((service) =>
      (occupiedByPort.get(service.port) ?? []).map((occupant) => ({ service, occupant, current: processByPid.get(Number(occupant.Pid)) ?? null })),
    );
    return buildConflict('没有可验证的 .runtime/studio-services.json，不能接管占用端口', unknownOccupants);
  }

  const recordedPids = new Set(
    state.processes
      ?.map((processRecord) => Number(processRecord.pid))
      .filter(Number.isInteger) ?? [],
  );
  const unknownOccupants = [];
  const deadRecordedPids = [];

  for (const service of SERVICE_DEFS) {
    for (const occupant of occupiedByPort.get(service.port) ?? []) {
      const pid = Number(occupant.Pid);
      const current = processByPid.get(pid);
      if (!recordedPids.has(pid) || !current || !belongsToRepository(current, repoRoot)) {
        unknownOccupants.push({ service, occupant, current });
      }
    }
  }

  for (const pid of recordedPids) {
    if (!processByPid.has(pid)) deadRecordedPids.push(pid);
  }

  if (unknownOccupants.length > 0) {
    return buildConflict('端口由非本工作区状态记录的进程占用', unknownOccupants);
  }

  if (!allRequiredOccupied) {
    return { mode: 'restart', reusable: false, partial: true, deadRecordedPids };
  }

  if (state.status !== 'running') {
    return { mode: 'restart', reusable: false, deadRecordedPids };
  }

  return { mode: 'choose', reusable: true, deadRecordedPids };
}

function groupOccupantsByPort(occupants) {
  const grouped = new Map();
  for (const occupant of occupants) {
    const port = Number(occupant.Port);
    if (!Number.isInteger(port)) continue;
    if (!grouped.has(port)) grouped.set(port, []);
    grouped.get(port).push(occupant);
  }
  return grouped;
}

function buildConflict(reason, unknownOccupants = []) {
  return {
    mode: 'conflict',
    reusable: false,
    reason,
    unknownOccupants,
  };
}
