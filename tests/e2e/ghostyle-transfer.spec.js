import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createCanvas, loadImage } from 'canvas';

const fixtures = 'tests/fixtures/synthetic-faces';
const cleanPhoto = fixtures + '/figure3-clean.jpeg';
const archiveKey = 'gstmxx.faces.v1';

/**
 * Paints two known shapes on the same source pixels. This isolates transfer
 * errors from inconsistencies between separately rendered reference photos.
 */
async function controlledPhoto() {
   const image = await loadImage(cleanPhoto);
   const canvas = createCanvas(image.width, image.height);
   const ctx = canvas.getContext('2d');
   ctx.drawImage(image, 0, 0);
   ctx.fillStyle = '#19e4db';
   ctx.fillRect(173, 147, 22, 18);
   ctx.fillStyle = '#ba1be5';
   ctx.fillRect(223, 151, 24, 20);
   return { name: 'painted-control.png', mimeType: 'image/png', buffer: canvas.toBuffer('image/png') };
}

test('extracts from two files and downloads the Ghostyle used in the preview', async ({ page }) => {
   await page.goto('/ghostyle-transfer.html');
   const clean = page.getByRole('button', { name: 'Clean photo', exact: true });
   const painted = page.getByRole('button', { name: 'Painted photo', exact: true });
   const download = page.getByRole('button', { name: 'Download Ghostyle .js' });
   const slider = page.getByRole('slider', { name: 'Sensitivity' });
   const status = page.locator('#transfer-status');
   const preview = page.getByRole('img', { name: 'Ghostyle preview' });
   await expect(download).toBeDisabled();
   await clean.setInputFiles(cleanPhoto);
   await painted.setInputFiles(await controlledPhoto());
   await expect(status).toHaveText('2 polygons ready to export.', { timeout: 25_000 });
   await expect(preview).toBeVisible();
   const topEdges = await page.locator('.transfer-image').evaluateAll(images => (
      images.map(image => image.getBoundingClientRect().top)
   ));
   expect(new Set(topEdges).size).toBe(1);
   const changed = await preview.evaluate(canvas => {
      const { width, height } = canvas;
      const actual = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      const clean = document.querySelector('#clean-image').getContext('2d').getImageData(0, 0, width, height).data;
      let pixels = 0;
      for (let i = 0; i < actual.length; i += 4) {
         if (Math.abs(actual[i] - clean[i]) + Math.abs(actual[i + 1] - clean[i + 1]) > 60) pixels += 1;
      }
      return pixels;
   });
   expect(changed).toBeGreaterThan(250);

   const downloaded = page.waitForEvent('download');
   await download.click();
   const file = await downloaded;
   expect(file.suggestedFilename()).toBe('ghostyle-transfer.js');
   const source = await readFile(await file.path(), 'utf8');
   expect(source).toContain('export function paintUV');
   expect(source).toContain('#19e4db');
   expect(source).toContain('#ba1be5');

   await slider.fill('78');
   await expect(page.locator('#transfer-sensitivity-value')).toHaveText('78');
   await expect(download).toBeEnabled();

   const target = page.getByLabel('Try another face (optional)');
   await target.setInputFiles(fixtures + '/figure10-clean.jpeg');
   await expect(preview).toHaveJSProperty('width', 1448);
   await expect(page.locator('#target-message')).toBeEmpty({ timeout: 15_000 });
   await page.getByRole('button', { name: 'Remove', exact: true }).click();
   await expect(preview).toHaveJSProperty('width', 512);
   await expect(download).toBeEnabled();

   await painted.setInputFiles(cleanPhoto);
   await expect(status).toHaveText('No paint regions at this sensitivity.', { timeout: 15_000 });
   await expect(download).toBeDisabled();
});

test('recovers from an invalid photo on mobile and shares its saved reference with Lab', async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto('/ghostyle-transfer.html');
   await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
      model: 'face-api-128d-v1',
      nextId: 5,
      activeRealtimeId: 4,
      faces: [{ id: 4, descriptor: Array(128).fill(0), realtime: { calibrated: true } }],
   })), archiveKey);
   const painted = page.getByRole('button', { name: 'Painted photo', exact: true });
   const download = page.getByRole('button', { name: 'Download Ghostyle .js' });
   const save = page.getByRole('button', { name: 'Save clean face to Lab' });
   await page.getByRole('button', { name: 'Clean photo', exact: true }).setInputFiles(cleanPhoto);
   await painted.setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
   await expect(page.locator('#painted-message')).toContainText('Could not open this image');
   await expect(download).toBeDisabled();
   await painted.setInputFiles(fixtures + '/figure3-painted.jpeg');
   await expect(download).toBeEnabled({ timeout: 25_000 });
   await expect(save).toBeEnabled({ timeout: 25_000 });
   const archiveBeforeSave = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), archiveKey);
   expect(archiveBeforeSave.faces).toHaveLength(1);
   await save.click();
   await expect(page.locator('#transfer-save-status')).toHaveText('Face #5 saved');
   await expect(page.locator('#clean-match')).toHaveText('Lab match #5 · distance 0.00');
   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

   const archive = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), archiveKey);
   expect(archive).toMatchObject({ model: 'face-api-128d-v1', nextId: 6, activeRealtimeId: 4 });
   expect(archive.faces[0]).toEqual(archiveBeforeSave.faces[0]);
   expect(archive.faces[1].descriptor).toHaveLength(128);
   expect(archive.faces[1].thumbnail).toMatch(/^data:image\/jpeg;base64,/);
   await page.getByRole('link', { name: 'Workshop Lab' }).click();
   await page.getByRole('button', { name: /Faces/ }).click();
   await expect(page.getByRole('img', { name: 'Saved face #5' })).toBeVisible();
});
