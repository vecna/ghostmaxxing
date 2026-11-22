import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { captureClipboardImages } from './helpers/workshop.js';

const original = `export function onDraw(ctx) {
   ctx.fillStyle = '#ff0000';
   ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}`;
const changed = original.replace('#ff0000', '#0044ff');

/** Supplies independent geometry mocks and rejects any requested recognition model. */
async function mockPlayerModels(page) {
   await page.route('/lab-js/vendor/face-api.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
         const net = { loadFromUri: async () => {} };
         window.faceapi = {
            TinyFaceDetectorOptions: class {},
            nets: {
               tinyFaceDetector: net,
               faceLandmark68Net: net,
               faceRecognitionNet: { loadFromUri() { throw Error('recognition is forbidden in this test'); } },
            },
            detectSingleFace: frame => ({
               withFaceLandmarks: async () => {
                  const w = frame.videoWidth;
                  const h = frame.videoHeight;
                  const positions = Array.from({ length: 68 }, (_, index) => ({
                     x: w * (0.25 + 0.008 * index), y: h * (0.48 + 0.001 * index),
                  }));
                  return { landmarks: { positions }, detection: { box: { x: w / 4, y: h / 4, width: w / 2, height: h / 2 } } };
               },
            }),
         };
      `,
   }));
   await page.route('/lab-js/vendor/tasks-vision@0.10.35.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
         export class FilesetResolver { static async forVisionTasks() { return {}; } }
         export class FaceLandmarker {
            static async createFromOptions() {
               return { detectForVideo: () => ({
                  faceLandmarks: [Array.from({ length: 478 }, (_, index) => ({
                     x: 0.25 + 0.001 * index, y: 0.35,
                  }))],
               }) };
            }
         }
      `,
   }));
   await page.route('/ghostyles/beauty-2d.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: original,
   }));
}

/** Reads actual pixels from a Player canvas. */
function pixel(canvas) {
   return canvas.evaluate(element => [...element.getContext('2d').getImageData(0, 0, 1, 1).data]);
}

test.beforeEach(async ({ page }) => {
   await mockPlayerModels(page);
});

test('opens named Ghostyles and applies edited source to the desktop preview', async ({ page }) => {
   await page.setViewportSize({ width: 1280, height: 820 });
   const recognitionRequests = [];
   page.on('request', request => {
      if (/recognition_model|mobilenet|face-archive/.test(request.url())) recognitionRequests.push(request.url());
   });
   await page.goto('/ghostyle-player.html');
   const editor = page.getByRole('textbox', { name: 'Ghostyle code' });
   const selector = page.getByRole('combobox', { name: 'Ghostyle' });
   const reload = page.getByRole('button', { name: 'Reload' });
   const layer = page.locator('#ghostyle-2d');
   await expect(selector).toHaveValue('beauty-2d');
   await expect(selector.locator('option')).toContainText(['Demo-2D', 'UV Stripes']);
   await expect(selector.locator('option[value="brush"]')).toHaveCount(0);
   await expect(editor).toHaveValue(original);
   const [previewBox, editorBox] = await Promise.all([
      page.locator('#viewer').boundingBox(), page.locator('#player-source-panel').boundingBox(),
   ]);
   expect(previewBox.width).toBe(editorBox.width);
   await expect.poll(() => pixel(layer)).toEqual([255, 0, 0, 255]);

   await editor.fill(changed);
   expect(await pixel(layer)).toEqual([255, 0, 0, 255]);
   await reload.click();
   await expect(page.locator('#player-editor-status')).toHaveText('Code applied');
   await expect.poll(() => pixel(layer)).toEqual([0, 68, 255, 255]);

   await editor.fill('export function onDraw( {');
   await reload.click();
   await expect(page.locator('#player-editor-status')).toHaveAttribute('data-error', '');
   expect(await pixel(layer)).toEqual([0, 68, 255, 255]);

   await selector.selectOption('');
   await expect(editor).toBeDisabled();
   await expect.poll(() => pixel(layer)).toEqual([0, 0, 0, 0]);
   await selector.selectOption('beauty-2d');
   await expect(editor).toHaveValue('export function onDraw( {');
   await expect.poll(() => pixel(layer)).toEqual([0, 68, 255, 255]);
   expect(recognitionRequests).toEqual([]);
});

test('paints natively on mobile and toggles diagnostics independently', async ({ page }) => {
   await page.setViewportSize({ width: 390, height: 844 });
   await page.goto('/ghostyle-player.html');
   const editor = page.getByRole('textbox', { name: 'Ghostyle code' });
   const layer = page.locator('#brush-layer');
   const mesh = page.locator('#landmarks-3d');
   const points = page.locator('#landmarks-2d');
   await expect(editor).toBeHidden();
   await page.getByRole('button', { name: 'Show code' }).click();
   await expect(page.locator('#player-status')).toHaveText('Code editor is available on desktop only.');
   await expect(editor).toBeHidden();
   await page.getByRole('combobox', { name: 'Ghostyle' }).selectOption('');
   await page.getByRole('button', { name: 'Brush', exact: true }).click();
   await expect(page.getByRole('button', { name: '2D points' })).toBeVisible();
   await page.getByRole('button', { name: '2D points' }).click();
   await page.getByRole('button', { name: '3D mesh' }).click();
   await expect(mesh).toBeVisible();
   await expect(points).toBeVisible();
   await page.getByRole('button', { name: '2D points' }).click();
   await expect(mesh).toBeVisible();
   await expect(points).toBeHidden();

   const canPaint = await layer.boundingBox();
   const click = async () => page.mouse.click(canPaint.x + canPaint.width / 2, canPaint.y + canPaint.height / 2);
   await expect(async () => {
      await click();
      expect(await page.getByRole('button', { name: 'Undo' }).isEnabled()).toBe(true);
   }).toPass({ timeout: 8000 });
   await page.getByRole('button', { name: 'Bake to code' }).click();
   await expect(page.locator('#player-status')).toHaveText('Code editor is available on desktop only.');
   await expect(editor).toBeHidden();
   await page.setViewportSize({ width: 1280, height: 800 });
   await page.getByRole('button', { name: 'Bake to code' }).click();
   await expect(editor).toBeVisible();
   await expect(editor).toHaveValue(/export function onDraw/);
   await page.getByRole('button', { name: 'Reload' }).click();
   await expect(page.locator('#player-editor-status')).toHaveText('Code applied');
   await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('records the composited output for about two seconds and requires upload consent', async ({ page }) => {
   await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
      Object.defineProperty(navigator, 'canShare', { value: () => false });
   });
   let uploaded;
   await page.route('**/api/uploads', async route => {
      uploaded = route.request().postDataBuffer();
      await route.fulfill({
         status: 201,
         json: { ok: true, uploadId: 'player-clip', deleteToken: 'fixture-token' },
         headers: { 'access-control-allow-origin': '*' },
      });
   });
   await page.goto('/ghostyle-player.html');
   await expect.poll(() => pixel(page.locator('#ghostyle-2d'))).toEqual([255, 0, 0, 255]);
   const recordingStarted = Date.now();
   await page.getByRole('button', { name: 'Record 2s' }).click();
   await page.locator('#gm-nav-upload').click();
   const dialog = page.getByRole('dialog', { name: 'Upload & report' });
   const copy = dialog.getByRole('button', { name: 'Copy clip' });
   await expect(copy).toBeEnabled({ timeout: 10000 });
   expect(Date.now() - recordingStarted).toBeGreaterThanOrEqual(1800);
   const download = page.waitForEvent('download');
   await copy.click();
   expect((await download).suggestedFilename()).toMatch(/\.(webm|mp4)$/);

   const clip = await dialog.locator('video').evaluate(async video => {
      video.muted = true;
      await video.play();
      await new Promise(resolve => video.requestVideoFrameCallback(resolve));
      video.pause();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
   });
   expect(clip[0]).toBeGreaterThan(230);
   expect(clip[1]).toBeLessThan(25);
   expect(clip[2]).toBeLessThan(25);

   const submit = dialog.getByRole('button', { name: 'Submit to moderation' });
   await expect(submit).toBeDisabled();
   expect(uploaded).toBeUndefined();
   await dialog.getByRole('checkbox').check();
   await submit.click();
   await expect(dialog.locator('#gm-upload-status')).toHaveAttribute('data-kind', 'ok');
   expect(uploaded.toString()).toContain('name="channel"\r\n\r\nghostyles');
   expect(uploaded.toString()).toContain('name="ghostyle_id"');
   expect(uploaded.toString()).toContain('beauty-2d');
});


test('swaps the code label, highlights and indents the draft, and downloads the JavaScript', async ({ page }) => {
   await page.setViewportSize({ width: 1250, height: 800 });
   await page.goto('/ghostyle-player.html');
   const editor = page.getByRole('textbox', { name: 'Ghostyle code' });
   const highlight = page.locator('#source-highlight');

   await expect(page.getByRole('button', { name: 'Hide code' })).toHaveAttribute('aria-expanded', 'true');
   await page.getByRole('button', { name: 'Hide code' }).click();
   await expect(page.getByRole('button', { name: 'Show code' })).toHaveAttribute('aria-expanded', 'false');
   await expect(editor).toBeHidden();
   await page.getByRole('button', { name: 'Show code' }).click();
   await expect(editor).toHaveValue(original);
   await expect(highlight.locator('.source-keyword').first()).toHaveText('export');
   await expect(highlight.locator('.source-string')).toHaveText("'#ff0000'");

   const manyLines = Array.from({ length: 95 }, (_, index) => '// ' + index).join('\n');
   await editor.fill(manyLines + '\n//' + ' long'.repeat(120));
   await editor.evaluate(control => { control.scrollTop = 75; control.scrollLeft = 60; });
   await expect(highlight).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -60, -75)');

   await editor.fill(changed.replace(/^   /gm, ''));
   await page.getByRole('button', { name: 'Auto-indent' }).click();
   await expect(editor).toHaveValue(changed);
   await expect(highlight.locator('.source-string')).toHaveText("'#0044ff'");

   const downloading = page.waitForEvent('download');
   await page.getByRole('button', { name: 'Download .js' }).click();
   const file = await downloading;
   expect(file.suggestedFilename()).toBe('beauty-2d.js');
   expect(await readFile(await file.path(), 'utf8')).toBe(changed);
   await expect.poll(() => pixel(page.locator('#ghostyle-2d'))).toEqual([255, 0, 0, 255]);
});

test('puts live Ghostyle parameters in their own row above the themed controls', async ({ page }) => {
   await page.route('/ghostyles/uv-stripes.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
         export const params = [
            { name: 'opacity', label: 'Effect opacity', type: 'range', min: 0, max: 1, step: 0.1, default: 1 },
            { name: 'enabled', label: 'Pattern enabled', type: 'bool', default: true },
            { name: 'mode', type: 'select', options: ['bands', 'lines'], default: 'bands' },
            { name: 'color', label: 'Effect color', type: 'color', default: '#ff0000' },
         ];
         export function onDraw(ctx, landmarks, box, params) {
            if (!params.enabled) return;
            ctx.globalAlpha = params.opacity;
            ctx.fillStyle = params.mode === 'bands' ? 'rgb(' + params.color.join(',') + ')' : '#0000ff';
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
         }
      `,
   }));
   await page.goto('/ghostyle-player.html');
   const settings = page.getByRole('group', { name: 'Ghostyle settings' });
   const select = page.getByRole('combobox', { name: 'Ghostyle' });
   const layer = page.locator('#ghostyle-2d');
   await expect(settings).toBeHidden();
   await select.selectOption('uv-stripes');
   await expect(settings).toBeVisible();
   const [row, viewer, editor, controls] = await Promise.all([
      settings.boundingBox(), page.locator('#viewer').boundingBox(),
      page.locator('#player-source-panel').boundingBox(), page.locator('.player-controls').boundingBox(),
   ]);
   expect(row.x).toBeGreaterThan(viewer.x);
   expect(row.width).toBeLessThan(viewer.width);
   expect(row.x + row.width).toBeLessThan(editor.x);
   expect(row.y + row.height).toBeLessThanOrEqual(controls.y);

   await settings.getByLabel('Effect color').fill('#00ff00');
   await expect.poll(() => pixel(layer)).toEqual([0, 255, 0, 255]);
   await settings.getByRole('slider', { name: /Effect opacity/ }).fill('0.5');
   await expect.poll(async () => (await pixel(layer))[3]).toBe(128);
   await settings.getByRole('combobox', { name: 'mode' }).selectOption({ label: 'lines' });
   await expect.poll(async () => (await pixel(layer))[2]).toBe(255);
   await settings.getByRole('checkbox', { name: 'Pattern enabled' }).uncheck();
   await expect.poll(() => pixel(layer)).toEqual([0, 0, 0, 0]);

   await select.selectOption('beauty-2d');
   await expect(settings).toBeHidden();
   await select.selectOption('uv-stripes');
   await expect(settings.getByRole('checkbox', { name: 'Pattern enabled' })).not.toBeChecked();

   const colors = await Promise.all([
      page.getByRole('button', { name: 'Brush', exact: true }),
      page.getByRole('button', { name: '2D points' }),
      page.getByRole('button', { name: 'Record 2s' }),
   ].map(button => button.evaluate(element => getComputedStyle(element).color)));
   expect(new Set(colors).size).toBe(3);
   await page.setViewportSize({ width: 390, height: 844 });
   await expect(page.locator('#player-source-panel')).toBeHidden();
   await expect(page.getByRole('button', { name: 'Show code' })).toBeVisible();
   expect((await settings.boundingBox()).width).toBeLessThan(390);
   expect(await settings.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
   const lines = await settings.locator('label').evaluateAll(items => new Set(
      items.map(item => {
         const bounds = item.getBoundingClientRect();
         return Math.round(bounds.top + bounds.height / 2);
      }),
   ).size);
   expect(lines).toBeGreaterThan(1);
});

test('copies the live composite with the active Ghostyle name and the project URL', async ({ page }) => {
   await captureClipboardImages(page);
   await page.goto('/ghostyle-player.html');
   await expect.poll(() => pixel(page.locator('#ghostyle-2d'))).toEqual([255, 0, 0, 255]);
   const copy = page.getByRole('button', { name: 'Copy image' });
   await expect(copy).toBeEnabled();
   await copy.click();
   await expect(page.locator('#player-status')).toHaveText('Image copied');
   const styled = await page.evaluate(() => window.copiedImages[0]);
   expect(styled.text).toBe('Ghostmaxxing · https://ghostmaxxing.vecna.eu/\nGhostyle Demo-2D');
   expect(styled.framePixel).toEqual([255, 0, 0, 255]);
   expect(styled.footerPixel).toEqual([16, 13, 10, 255]);

   await page.getByRole('combobox', { name: 'Ghostyle' }).selectOption('');
   await expect.poll(() => pixel(page.locator('#ghostyle-2d'))).toEqual([0, 0, 0, 0]);
   await copy.click();
   await expect.poll(() => page.evaluate(() => window.copiedImages.length)).toBe(2);
   const plain = await page.evaluate(() => window.copiedImages[1]);
   expect(plain.text).toBe('Ghostmaxxing · https://ghostmaxxing.vecna.eu/');
   expect(plain.height).toBeLessThan(styled.height);
});
