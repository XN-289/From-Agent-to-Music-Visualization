const BOOT_STYLE_ID = 'folia-boot-style';

function ensureBootStyle() {
  document.getElementById(BOOT_STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = BOOT_STYLE_ID;
  style.textContent = `
    html, body, #root {
      height: 100%;
      margin: 0;
    }

    body {
      align-items: center;
      background-color: #09090b;
      color: #f4f4f5;
      display: flex;
      font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      justify-content: center;
      overflow: hidden;
    }

    .folia-boot {
      text-align: center;
    }

    .folia-boot-title {
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 0;
      margin: 0;
    }

    .folia-boot-message {
      color: #a1a1aa;
      font-size: 0.875rem;
      margin: 0.5rem 0 0;
    }

    .folia-boot-error {
      color: #fca5a5;
      font-size: 0.75rem;
      margin: 0.75rem 0 0;
      max-width: 36rem;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
  `;
  document.head.appendChild(style);
}

export function showBootPlaceholder() {
  const root = document.getElementById('root');
  if (!root || root.childElementCount > 0) {
    return;
  }

  ensureBootStyle();

  const boot = document.createElement('div');
  boot.className = 'folia-boot';
  boot.setAttribute('aria-busy', 'true');
  boot.setAttribute('aria-live', 'polite');
  boot.setAttribute('role', 'status');

  const title = document.createElement('h1');
  title.className = 'folia-boot-title';
  title.textContent = 'Folia';

  const message = document.createElement('p');
  message.className = 'folia-boot-message';
  message.textContent = '正在启动...';

  boot.append(title, message);
  root.replaceChildren(boot);
}

export function showBootError(error: unknown) {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  ensureBootStyle();

  const boot = document.createElement('div');
  boot.className = 'folia-boot';
  boot.setAttribute('role', 'alert');

  const title = document.createElement('h1');
  title.className = 'folia-boot-title';
  title.textContent = 'Folia';

  const message = document.createElement('p');
  message.className = 'folia-boot-message';
  message.textContent = '启动失败，请刷新重试。';

  const detail = document.createElement('p');
  detail.className = 'folia-boot-error';
  detail.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  boot.append(title, message, detail);
  root.replaceChildren(boot);
}
