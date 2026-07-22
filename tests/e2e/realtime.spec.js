import { test, expect } from '@playwright/test';

test.describe('Realtime page', () => {
  test('loads realtime html, css, and js without 404 responses', async ({ page }) => {
    const targetPaths = new Set(['/realtime.html', '/styles/realtime.css', '/scripts/realtime.js']);
    const seen = new Set();
    const failing = [];

    page.on('response', async (response) => {
      const url = new URL(response.url());
      if (!targetPaths.has(url.pathname)) return;
      seen.add(url.pathname);
      if (response.status() === 404) {
        failing.push({ path: url.pathname, status: response.status() });
      }
    });

    await page.goto('/realtime.html');

    await expect.poll(() => Array.from(seen).sort()).toEqual(Array.from(targetPaths).sort());
    expect(failing).toEqual([]);

    await expect(page.locator('#ui-layer')).toBeVisible();
    await expect(page.locator('#embedding-bar .descriptor-row')).toHaveCount(128);

    const hasRuntimeBridge = await page.evaluate(() => {
      return Boolean(window.gstmxxRealtime && typeof window.gstmxxRealtime.getState === 'function');
    });
    expect(hasRuntimeBridge).toBeTruthy();
  });
});
