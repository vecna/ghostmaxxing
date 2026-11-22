import { test, expect } from '@playwright/test';
import { captureClipboardImages, mockWorkshopDetector } from './helpers/workshop.js';

test.beforeEach(async ({ page }) => {
   await mockWorkshopDetector(page);
});

test('keeps home, the reading and the history on one compact row on mobile', async ({ page }) => {
   await page.setViewportSize({ width: 320, height: 568 });
   const requests = [];
   page.on('request', request => requests.push(new URL(request.url()).pathname));
   await page.goto('/lab.html');
   await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
   await expect(page.locator('#placeholder')).toBeHidden();
   const home = page.getByRole('link', { name: 'Home', exact: true });
   const bar = page.locator('.match-bar');
   const reading = page.locator('#readout');
   const timeline = page.locator('#gm-history');

   await expect(home).toHaveAttribute('href', '/');
   await expect(home.locator('img')).toHaveCount(0);
   const [container, icon, status, track] = await Promise.all(
      [bar, home, reading, timeline].map(element => element.boundingBox()),
   );
   expect(container.height).toBeLessThanOrEqual(42);
   expect(icon.x + icon.width).toBeLessThan(status.x);
   expect(status.x + status.width).toBeLessThan(track.x);
   expect(track.x + track.width).toBeLessThanOrEqual(container.width);
   expect(Math.abs(icon.y + icon.height / 2 - track.y - track.height / 2)).toBeLessThan(2);
   expect(requests).not.toContain('/ghostyles.json');
   expect(requests.some(url => url.startsWith('/ghostyles/'))).toBe(false);
});

test('opens the five About sections next to Upload without scrolling', async ({ page }) => {
   await page.setViewportSize({ width: 320, height: 568 });
   await page.goto('/lab.html');
   const upload = page.getByRole('button', { name: 'Upload', exact: true });
   const about = page.getByRole('button', { name: 'About', exact: true });
   expect(await about.evaluate(element => element.previousElementSibling.id)).toBe(await upload.getAttribute('id'));
   await about.click();
   const dialog = page.getByRole('dialog', { name: /Ghostmaxxing v\d/ });
   const links = [
      ['Documentation', 'How face recognition works', '/docs/understand/face-recognition.html'],
      ['Tools', 'Realtime · Makeup Explorer', '/realtime.html'],
      ['Latest links', 'Shared gallery', '/gallery.html'],
      ['Code', 'Ghostmaxxing · GitHub', 'https://github.com/vecna/ghostmaxxing'],
      ['Fediverse', 'Fediverse accounts and feeds', '/fediverse.html'],
   ];
   for (const [section, name, href] of links) {
      await dialog.getByRole('button', { name: section, exact: true }).click();
      await expect(dialog.getByRole('link', { name })).toHaveAttribute('href', href);
      await expect(dialog.locator('[data-about-panel]:visible')).toHaveCount(1);
      expect(await dialog.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
   }
   await dialog.getByRole('button', { name: 'Close' }).click();
   await expect(about).toBeFocused();
});

test('records a local clip, offers export and uploads only after consent', async ({ page }) => {
   await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
      Object.defineProperty(navigator, 'canShare', { value: () => false });
   });
   const uploads = [];
   await page.route('**/api/uploads', route => {
      uploads.push(route.request().postDataBuffer());
      return route.fulfill({
         status: 201,
         json: { ok: true, uploadId: 'workshop-clip', deleteToken: 'test-token' },
         headers: { 'access-control-allow-origin': '*' },
      });
   });
   await page.goto('/lab.html');
   const imageDownload = page.waitForEvent('download');
   await page.getByRole('button', { name: 'Copy image' }).click();
   expect((await imageDownload).suggestedFilename()).toBe('ghostmaxxing.png');

   const record = page.getByRole('button', { name: 'Record 1s' });
   await record.click();
   await page.locator('#gm-nav-upload').click();
   const dialog = page.getByRole('dialog', { name: 'Upload & report' });
   const copy = dialog.getByRole('button', { name: 'Copy clip' });
   await expect(copy).toBeEnabled();
   const download = page.waitForEvent('download');
   await copy.click();
   expect((await download).suggestedFilename()).toMatch(/^ghostmaxxing-\d+\.(webm|mp4)$/);
   expect(uploads).toHaveLength(0);

   await expect(dialog.locator('video')).toHaveAttribute('src', /^blob:/);
   const submit = dialog.getByRole('button', { name: 'Submit to moderation' });
   await expect(submit).toBeDisabled();
   await dialog.getByRole('checkbox').check();
   await submit.click();
   await expect(dialog.locator('#gm-upload-status')).toHaveAttribute('data-kind', 'ok');
   expect(uploads).toHaveLength(1);
   expect(uploads[0].toString()).toContain('name="video"');
   expect(uploads[0].toString()).toContain('name="channel"\r\n\r\nmakeup');
   expect(uploads[0].toString()).not.toContain('name="ghostyle_id"');
});


test('copies the current image before recording and adds the Lab reading when available', async ({ page }) => {
   await captureClipboardImages(page);
   await page.goto('/lab.html');
   const copy = page.getByRole('button', { name: 'Copy image' });
   await expect(copy).toBeEnabled();
   await copy.click();
   await expect(page.locator('#gm-toast')).toHaveText('Image copied');
   const bare = await page.evaluate(() => window.copiedImages[0]);
   expect(bare.text).toBe('Ghostmaxxing · https://ghostmaxxing.vecna.eu/');
   expect(bare.height).toBeGreaterThan(bare.videoHeight);
   expect(bare.footerPixel).toEqual([16, 13, 10, 255]);

   await page.getByRole('button', { name: 'Save', exact: true }).click();
   await expect(page.locator('#gm-face')).toHaveText('#0');
   await copy.click();
   await expect.poll(() => page.evaluate(() => window.copiedImages.length)).toBe(2);
   const compared = await page.evaluate(() => window.copiedImages[1]);
   expect(compared.text).toContain('Recognised · #0 · Distance 0.000 / threshold 0.58');
   expect(compared.height).toBeGreaterThan(bare.height);
});
