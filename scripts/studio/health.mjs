import { SERVICE_DEFS } from './constants.mjs';

export function validateServiceResponse(service, response, body) {
  if (response.status !== 200) {
    return `HTTP ${response.status}`;
  }

  if (service.type === 'html') {
    const normalizedBody = body.toLowerCase();
    const missing = service.requiredMarkers.filter((marker) => !normalizedBody.includes(marker.toLowerCase()));
    return missing.length === 0 ? null : `缺少语义标记：${missing.join(', ')}`;
  }

  if (service.type !== 'json') {
    return `未知健康检查类型：${service.type}`;
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return '响应不是有效 JSON';
  }

  for (const [field, expected] of Object.entries(service.requiredFields)) {
    if (payload[field] !== expected) {
      return `${field} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(payload[field])}`;
    }
  }

  return null;
}

export async function checkServiceOnce(service, fetchImpl = fetch) {
  const response = await fetchImpl(service.healthUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  const body = await response.text();
  const semanticError = validateServiceResponse(service, response, body);
  if (semanticError) {
    throw new Error(`${service.label} 健康检查失败：${semanticError}`);
  }
  return { status: response.status, bodyLength: body.length };
}

export async function waitForService(service, options = {}) {
  const {
    fetchImpl = fetch,
    timeoutMs = service.timeoutMs,
    intervalMs = service.intervalMs,
    isProcessExited = () => false,
    onAttempt = () => {},
  } = options;
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (isProcessExited(service)) {
      throw new Error(`${service.label} 进程在健康检查通过前退出`);
    }
    try {
      const result = await checkServiceOnce(service, fetchImpl);
      onAttempt({ ok: true, result });
      return result;
    } catch (error) {
      lastError = error;
      onAttempt({ ok: false, error });
    }
    await sleep(intervalMs);
  }

  throw new Error(`${service.label} ${timeoutMs}ms 内未通过健康检查：${lastError?.message ?? '无响应'}`);
}

export async function waitForServices(services, options = {}) {
  const { fetchImpl = fetch, onServiceStatus = () => {}, isProcessExited = () => false } = options;
  return Promise.all(
    services.map((service) =>
      waitForService(service, {
        fetchImpl,
        isProcessExited,
        onAttempt: (attempt) => onServiceStatus(service, attempt),
      }),
    ),
  );
}

export async function waitForAllServices(options = {}) {
  return waitForServices(SERVICE_DEFS, options);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
