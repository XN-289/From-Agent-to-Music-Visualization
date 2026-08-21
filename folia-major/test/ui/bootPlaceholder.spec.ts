import { expect, test } from '@playwright/test';

// test/ui/bootPlaceholder.spec.ts
// The complete Folia graph is loaded through a dynamic import. Keep the first paint useful even
// while Vite is transforming that graph during a cold dev-server start.

test('shows a boot state and a visible error if the app graph fails to load', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('i18nextLng', 'zh-CN');
  });
  let releaseBootstrap: () => void;
  const bootstrapReleased = new Promise<void>((resolve) => {
    releaseBootstrap = resolve;
  });

  await page.route('**/src/bootstrap.tsx*', async (route) => {
    await bootstrapReleased;
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: 'throw new Error("Boot fixture failure");',
    });
  });

  await page.goto('/');

  await expect(page.getByRole('status')).toContainText('Folia');
  await expect(page.getByRole('status')).toContainText('正在启动...');
  releaseBootstrap!();

  await expect(page.getByRole('alert')).toContainText('启动失败，请刷新重试。');
  await expect(page.getByRole('alert')).toContainText('Boot fixture failure');
});
