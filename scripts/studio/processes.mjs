import { spawn } from 'node:child_process';

export async function getPortOccupants(ports) {
  const portFilter = Array.from(ports).join(',');
  const output = await runPowerShell(
    `$ports = @(${portFilter}); Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"; [pscustomobject]@{ Port = [int]$_.LocalPort; LocalAddress = [string]$_.LocalAddress; Pid = [int]$_.OwningProcess; Name = [string]$p.Name; CommandLine = [string]$p.CommandLine; ExecutablePath = [string]$p.ExecutablePath } } | Sort-Object Port,Pid -Unique | ConvertTo-Json -Depth 3`,
  );
  return parsePowerShellJson(output);
}

export async function getProcessList() {
  const output = await runPowerShell(
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Depth 3',
  );
  return parsePowerShellJson(output);
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ${command}`,
      ],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`PowerShell 查询失败（${code}）：${stderr.trim()}`));
    });
  });
}

export function parsePowerShellJson(output) {
  const text = output.replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizeWindowsPath(value) {
  return value.replaceAll('\\', '/');
}

export function belongsToRepository(processRecord, repoRoot) {
  if (!processRecord) return false;
  const root = normalizeWindowsPath(repoRoot).toLowerCase();
  return [processRecord.CommandLine, processRecord.ExecutablePath].some((value) => {
    return typeof value === 'string' && normalizeWindowsPath(value).toLowerCase().includes(root);
  });
}

export function findProcessSnapshot(repoRoot, processList, rootPids) {
  const byParent = new Map();
  for (const processRecord of processList) {
    const parent = Number(processRecord.ParentProcessId);
    if (!Number.isInteger(parent)) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(processRecord);
  }

  const selected = new Map();
  const visit = (processRecord) => {
    const pid = Number(processRecord.ProcessId);
    if (!Number.isInteger(pid) || selected.has(pid)) return;
    if (pid !== 0 && belongsToRepository(processRecord, repoRoot)) {
      selected.set(pid, processRecord);
    }
    for (const child of byParent.get(pid) ?? []) visit(child);
  };

  for (const rootPid of rootPids) {
    const rootProcess = processList.find((processRecord) => Number(processRecord.ProcessId) === rootPid);
    if (rootProcess) visit(rootProcess);
  }
  return Array.from(selected.values());
}
