import { expect, test } from '@playwright/test';
import { FACE_ARCHIVE_KEY, FACE_DESCRIPTOR_MODEL } from '../../lab-js/face-archive.js';
import { mockWorkshopDetector } from './helpers/workshop.js';

test('updates the timeline when either verdict or candidate changes', async ({ page }) => {
   await mockWorkshopDetector(page);
   await page.addInitScript(({ key, model }) => {
      const faces = [0, 7].map(id => ({
         id,
         savedAt: '2026-11-01T12:00:00Z',
         descriptor: [id === 0 ? 0 : 2, ...Array(127).fill(0)],
      }));
      localStorage.setItem(key, JSON.stringify({ model, faces, nextId: 8 }));
   }, { key: FACE_ARCHIVE_KEY, model: FACE_DESCRIPTOR_MODEL });
   await page.goto('/lab.html');

   const banner = page.locator('#readout');
   const timeline = page.locator('#gm-history');
   await expect(banner).toHaveAttribute('data-status', 'matched');
   await expect(page.locator('#gm-face')).toHaveText('#0');
   await page.evaluate(() => { window.workshopDescriptor = 2; });
   await expect(page.locator('#gm-face')).toHaveText('#7');
   await expect(timeline.getByRole('img', { name: 'Recognised · #0' })).toBeVisible();
   await expect(timeline.getByRole('img', { name: 'Recognised · #7' })).toBeVisible();

   await page.evaluate(() => { window.workshopDescriptor = 0.6; });
   await expect(banner).toHaveAttribute('data-status', 'near');
   await expect(page.locator('#gm-num')).toHaveText('0.600');
   await expect(timeline.getByRole('img', { name: 'Near threshold · #0' })).toBeVisible();

   await page.evaluate(() => { window.workshopDescriptor = 1.3; });
   await expect(banner).toHaveAttribute('data-status', 'far');
   await expect(timeline.getByRole('img', { name: 'Above threshold · #7' })).toBeVisible();

   await page.evaluate(() => { window.workshopDescriptor = null; });
   await expect(banner).toHaveAttribute('data-status', 'absent');
   await expect(page.locator('#gm-face')).toHaveText('—');
   await expect(timeline.locator('[data-status="absent"]')).toBeVisible();
});

test('saves and matches two fixture faces and shows an empty frame with the real model', async ({ page }) => {
   test.setTimeout(120000);
   await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
         const fixture = document.createElement('video');
         fixture.muted = true;
         fixture.playsInline = true;
         fixture.src = '/tests/fixtures/workshop-sequence.webm';
         await fixture.play();
         fixture.pause();
         const canvas = document.createElement('canvas');
         canvas.width = fixture.videoWidth;
         canvas.height = fixture.videoHeight;
         const context = canvas.getContext('2d');
         const draw = () => context.drawImage(fixture, 0, 0);
         window.seekWorkshopFixture = async seconds => {
            await new Promise(resolve => {
               fixture.addEventListener('seeked', resolve, { once: true });
               fixture.currentTime = seconds;
            });
            draw();
         };
         await window.seekWorkshopFixture(1);
         const stream = canvas.captureStream(10);
         const timer = setInterval(draw, 100);
         window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
         return stream;
      };
   });
   await page.goto('/lab.html');
   const save = page.getByRole('button', { name: 'Save', exact: true });
   const status = page.locator('#gm-state');
   const count = page.locator('#dbCountBadge');
   await expect(save).toBeEnabled({ timeout: 60000 });
   await save.click();
   await expect(count).toHaveText('1', { timeout: 30000 });
   await expect(status).toHaveText('Recognised · #0', { timeout: 20000 });

   await page.evaluate(() => window.seekWorkshopFixture(4));
   await expect(status).toHaveText('Above threshold · #0', { timeout: 20000 });
   await save.click();
   await expect(count).toHaveText('2', { timeout: 30000 });
   await expect(status).toHaveText('Recognised · #1', { timeout: 20000 });

   await page.evaluate(() => window.seekWorkshopFixture(7));
   await expect(page.locator('#readout')).toHaveAttribute('data-status', 'absent', { timeout: 20000 });
   await page.getByRole('button', { name: 'Faces 2' }).click();
   const faces = page.getByRole('dialog', { name: 'Saved faces' });
   await expect(faces.getByAltText('Saved face #0')).toBeVisible();
   await expect(faces.getByAltText('Saved face #1')).toBeVisible();
});
