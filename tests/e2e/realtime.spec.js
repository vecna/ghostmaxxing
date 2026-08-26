import { test, expect } from '@playwright/test';

/**
 * These run without a camera. getUserMedia rejects in headless Chromium unless
 * --use-fake-device-for-media-stream is set, so anything past initWebcam() is
 * out of scope here: the page is asserted up to the point where it needs a
 * camera, plus the pure functions that do not.
 */

const MODULE_PATHS = [
  '/lab-js/realtime.js',
  '/lab-js/realtime-graph.js',
  '/lab-js/realtime-capture.js',
  '/lab-js/realtime-gallery.js',
  '/lab-js/realtime-settings.js',
];

test.describe('Realtime page', () => {
  test('loads html, css and every module without 404 responses', async ({ page }) => {
    const targetPaths = new Set(['/realtime.html', '/styles/realtime.css', ...MODULE_PATHS]);
    const seen = new Set();
    const failing = [];

    page.on('response', (response) => {
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
  });

  test('exposes the runtime bridge with its documented shape', async ({ page }) => {
    await page.goto('/realtime.html');

    await expect
      .poll(() => page.evaluate(() => Boolean(window.gstmxxRealtime)))
      .toBeTruthy();

    const shape = await page.evaluate(() => ({
      getState: typeof window.gstmxxRealtime.getState,
      triggerCalibration: typeof window.gstmxxRealtime.triggerCalibration,
      teardown: typeof window.gstmxxRealtime.teardown,
      resume: typeof window.gstmxxRealtime.resume,
    }));

    expect(shape).toEqual({
      getState: 'function',
      triggerCalibration: 'function',
      teardown: 'function',
      resume: 'function',
    });
  });

  test('reports the cited threshold and plotted ceiling, not tunable values', async ({ page }) => {
    await page.goto('/realtime.html');
    await expect.poll(() => page.evaluate(() => Boolean(window.gstmxxRealtime))).toBeTruthy();

    const state = await page.evaluate(() => window.gstmxxRealtime.getState());
    expect(state.threshold).toBe(0.6);
    expect(state.graphMaxDistance).toBe(1.25);
    expect(state.windowSeconds).toBe(60);
    expect(state.hasBaseline).toBe(false);
    expect(state.noiseFloor).toBeNull();

    // No control may move the threshold: it is the one number here with a
    // citable provenance, and a moved threshold means nothing.
    await expect(page.locator('#settings-bar input[type="range"]')).toHaveCount(1);
    await expect(page.locator('#settings-bar #brightness-input')).toBeVisible();
  });

  test('legend states the two reference lines and distinguishes their provenance', async ({ page }) => {
    await page.goto('/realtime.html');

    const legend = page.locator('#graph-legend');
    await expect(legend).toContainText('Noise floor');
    await expect(legend).toContainText('Match threshold');
    await expect(legend).toContainText('0.60');
    await expect(legend).toContainText('LFW');
    await expect(page.locator('#legend-noise')).toHaveText('—');
  });

  test('equalizer toggle collapses the right column and persists', async ({ page }) => {
    await page.goto('/realtime.html');

    const toggle = page.locator('#toggle-equalizer');
    const layer = page.locator('#ui-layer');

    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#embedding-panel')).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(layer).toHaveClass(/hide-equalizer/);
    await expect(page.locator('#embedding-panel')).toBeHidden();

    // Rows stay in the DOM while hidden, so the descriptor grid is never
    // rebuilt on toggle.
    await expect(page.locator('#embedding-bar .descriptor-row')).toHaveCount(128);

    await page.reload();
    await expect(page.locator('#ui-layer')).toHaveClass(/hide-equalizer/);
  });

  test('brightness control moves only the display variable', async ({ page }) => {
    await page.goto('/realtime.html');

    const slider = page.locator('#brightness-input');
    await slider.fill('1.2');
    await slider.dispatchEvent('input');

    await expect(page.locator('#brightness-value')).toHaveText('1.20');

    const applied = await page.evaluate(() =>
      document.getElementById('ui-layer').style.getPropertyValue('--rt-brightness'),
    );
    expect(applied).toBe('1.2');
  });

  test('destructive controls require a second click', async ({ page }) => {
    await page.goto('/realtime.html');

    const deleteAll = page.locator('#btn-delete-all');
    await expect(deleteAll).toBeDisabled();
    await expect(deleteAll).toHaveText('Delete all');

    // Baseline controls stay hidden until a baseline exists.
    await expect(page.locator('#btn-baseline')).toBeHidden();
    await expect(page.locator('#btn-shutter')).toBeDisabled();
    await expect(page.locator('#calibration-ui')).toBeVisible();
    await expect(page.locator('#btn-baseline-start')).toBeVisible();
  });

  test('graph canvas is sticky inside a scrollable spacer', async ({ page }) => {
    await page.goto('/realtime.html');

    const position = await page.evaluate(
      () => getComputedStyle(document.getElementById('distance-graph')).position,
    );
    expect(position).toBe('sticky');

    const overflow = await page.evaluate(
      () => getComputedStyle(document.getElementById('graph-scroll')).overflowY,
    );
    expect(overflow).toBe('auto');

    await expect(page.locator('#graph-follow')).toBeHidden();
  });

  test('medoid picks a real member and reports its spread', async ({ page }) => {
    await page.goto('/realtime.html');

    const result = await page.evaluate(async () => {
      const { medoid, euclidean } = await import('/lab-js/realtime-capture.js');
      const tight = [
        [0, 0, 0],
        [0.01, 0, 0],
        [0, 0.01, 0],
        [0.4, 0.4, 0.4],
      ];
      const picked = medoid(tight);
      return {
        descriptor: picked.descriptor,
        spread: picked.spread,
        isMember: tight.some((row) => euclidean(row, picked.descriptor) === 0),
      };
    });

    expect(result.isMember).toBe(true);
    expect(result.spread).toBeGreaterThan(0);
    // The outlier must not be chosen.
    expect(result.descriptor).not.toEqual([0.4, 0.4, 0.4]);
  });

  test('zip export produces a readable archive header', async ({ page }) => {
    await page.goto('/realtime.html');

    const header = await page.evaluate(async () => {
      const { buildZip } = await import('/lab-js/realtime-gallery.js');
      const blob = buildZip([
        { name: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), date: new Date(2026, 0, 1) },
      ]);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { signature: Array.from(bytes.slice(0, 4)), type: blob.type };
    });

    expect(header.signature).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(header.type).toBe('application/zip');
  });

  test('duration formatting collapses long absences readably', async ({ page }) => {
    await page.goto('/realtime.html');

    const labels = await page.evaluate(async () => {
      const { formatDuration } = await import('/lab-js/realtime-graph.js');
      return [formatDuration(4000), formatDuration(492000), formatDuration(7500000)];
    });

    expect(labels).toEqual(['4s', '8m 12s', '2h 5m']);
  });
});
