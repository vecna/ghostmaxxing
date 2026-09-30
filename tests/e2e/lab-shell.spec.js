import { test, expect } from '@playwright/test';

test.describe('Lab shell', () => {
  test('keeps the mobile home mark clear of the view selector', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/lab.html', { waitUntil: 'domcontentloaded' });

    const home = page.locator('.gm-tool-back');
    const selector = page.locator('.viewbar .selector');

    await expect(home.locator('span')).toBeHidden();
    await expect(page.locator('.seg--home')).toBeHidden();

    const [homeBox, selectorBox] = await Promise.all([
      home.boundingBox(),
      selector.boundingBox(),
    ]);
    expect(homeBox).not.toBeNull();
    expect(selectorBox).not.toBeNull();
    expect(homeBox.x + homeBox.width).toBeLessThanOrEqual(selectorBox.x);
  });

  test('uses only Lab-owned styles and module entry points', async ({ page }) => {
    await page.goto('/lab.html', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('link[href="/styles/pages.css"]')).toHaveCount(0);
    await expect(page.locator('script[src="/lab-js/ghostyle3d-uv-renderer.js"]')).toHaveCount(0);
    await expect(page.locator('script[src="/lab-js/plugins3d-loader.js"]')).toHaveCount(0);
    await expect(page.locator('script[src="/lab-js/bbox-overlay.js"]')).toHaveCount(0);
    await expect(page.locator('#toggleSettingsBtn')).toHaveCount(0);

    const settingsButton = page.locator('.navbtn[data-screen="settings"]');
    const settingsScreen = page.locator('#settingsDrawer');
    await settingsButton.click();
    await expect(settingsScreen).toBeVisible();
    await settingsScreen.locator('[data-close-screen]').click();
    await expect(settingsScreen).toBeHidden();
  });
});
