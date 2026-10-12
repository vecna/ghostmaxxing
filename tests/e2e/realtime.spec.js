import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * The default project uses a Y4M fake camera. The workflow test additionally
 * selects a seekable local video with setInputFiles and deterministic model
 * output, which exercises the same advanced source a researcher can use.
 */

const MODULE_PATHS = [
  '/lab-js/realtime/realtime.js',
  '/lab-js/realtime/realtime-graph.js',
  '/lab-js/realtime/realtime-capture.js',
  '/lab-js/realtime/realtime-gallery.js',
  '/lab-js/realtime/realtime-radial.js',
  '/lab-js/realtime/realtime-settings.js',
];

async function mockRealtimeModels(page) {
  await page.addInitScript(() => {
    window.__rtDescriptorShift = 0;
    window.__rtAppearanceChange = false;
    window.__rtPoseShift = 0;
    window.__rtImageReads = 0;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function getImageData(x, y, width, height) {
      if (!width || !height) return originalGetImageData.call(this, x, y, width, height);
      const data = new Uint8ClampedArray(width * height * 4);
      window.__rtImageReads += 1;
      // Each quality pass reads ambient pixels first and the face crop second.
      // During the intervention only the face is darkened; ambient light stays
      // comparable, so the appearance change must not be filtered away.
      const value = window.__rtAppearanceChange && window.__rtImageReads % 2 === 0 ? 5 : 128;
      for (let offset = 0; offset < data.length; offset += 4) {
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
      return { data, width, height };
    };
  });
  await page.route('/lab-js/vendor/face-api.js', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        (() => {
          window.faceapi = {
            TinyFaceDetectorOptions: class TinyFaceDetectorOptions { constructor(options) { this.options = options; } },
            nets: {
              tinyFaceDetector: { loadFromUri: async () => {} },
              faceLandmark68Net: { loadFromUri: async () => {} },
              faceRecognitionNet: { loadFromUri: async () => {} },
            },
            detectSingleFace: input => {
              const width = input.videoWidth || 640;
              const height = input.videoHeight || 480;
              const faceSize = width * 0.5;
              const positions = Array.from({ length: 68 }, () => ({ x: width * 0.5, y: height * 0.42 }));
              positions[36] = { x: width * 0.4, y: height * 0.4 };
              positions[45] = { x: width * 0.6, y: height * 0.4 };
              positions[30] = { x: width * (0.5 + (window.__rtPoseShift || 0)), y: height * 0.45 };
              return {
                withFaceLandmarks: () => ({
                  withFaceDescriptor: async () => {
                  const descriptor = new Float32Array(128);
                  descriptor[0] = window.__rtDescriptorShift || 0;
                  return {
                    landmarks: { positions },
                    descriptor,
                    detection: {
                      score: window.__rtAppearanceChange ? 0.4 : 0.99,
                      box: { x: width * 0.25, y: height * 0.22, width: faceSize, height: faceSize },
                    },
                  };
                  },
                }),
              };
            },
          };
        })();
      `,
    });
  });
}

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
      startMakeupStep: typeof window.gstmxxRealtime.startMakeupStep,
      measureStep: typeof window.gstmxxRealtime.measureStep,
    }));

    expect(shape).toEqual({
      getState: 'function',
      triggerCalibration: 'function',
      teardown: 'function',
      resume: 'function',
      startMakeupStep: 'function',
      measureStep: 'function',
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
      const { medoid, euclidean } = await import('/lab-js/realtime/realtime-capture.js');
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
      const { buildZip } = await import('/lab-js/realtime/realtime-gallery.js');
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
      const { formatDuration } = await import('/lab-js/realtime/realtime-graph.js');
      return [formatDuration(4000), formatDuration(492000), formatDuration(7500000)];
    });

    expect(labels).toEqual(['4s', '8m 12s', '2h 5m']);
  });

  test('extracts a real 128D face-api descriptor from an uploaded video', async ({ page }) => {
    await page.goto('/realtime.html');
    await expect.poll(() => page.evaluate(() => window.gstmxxRealtime?.getState().running)).toBe(true);

    await page.setInputFiles(
      '#video-upload',
      path.join(process.cwd(), 'tests/fixtures/my-moving-face.mp4'),
    );
    await expect.poll(() => page.evaluate(() => window.gstmxxRealtime.getState().sourceKind)).toBe('video');
    await expect.poll(
      () => page.evaluate(() => {
        const state = window.gstmxxRealtime.getState();
        return { descriptorLength: state.lastDescriptorLength, score: state.lastDetectionScore };
      }),
      { timeout: 45000 },
    ).toEqual({ descriptorLength: 128, score: expect.any(Number) });
    expect(await page.evaluate(() => window.gstmxxRealtime.getState().lastDetectionScore)).toBeGreaterThan(0.5);
  });

  test('measures a declared makeup step from a seekable local video', async ({ page }) => {
    await mockRealtimeModels(page);
    await page.goto('/realtime.html');
    await expect.poll(() => page.evaluate(() => window.gstmxxRealtime?.getState().running)).toBe(true);

    await page.setInputFiles(
      '#video-upload',
      path.join(process.cwd(), 'tests/fixtures/my-moving-face.mp4'),
    );
    await expect.poll(() => page.evaluate(() => window.gstmxxRealtime.getState().sourceKind)).toBe('video');
    await expect(page.locator('#webcam')).toHaveJSProperty('controls', true);

    await page.locator('#btn-baseline-start').click();
    await expect.poll(
      () => page.evaluate(() => window.gstmxxRealtime.getState().appState),
      { timeout: 20000 },
    ).toBe('TRACKING');

    await expect.poll(
      () => page.evaluate(() => window.gstmxxRealtime.getState().sampleCount),
    ).toBeGreaterThan(0);
    const pausedAt = await page.evaluate(() => {
      const video = document.getElementById('webcam');
      video.pause();
      return video.currentTime;
    });
    await page.locator('#btn-start-change').click();
    await expect(page.locator('#webcam')).toHaveJSProperty('paused', false);
    await expect.poll(
      () => page.evaluate(() => document.getElementById('webcam').currentTime),
    ).toBeGreaterThan(pausedAt + 0.05);
    const applyingSampleCount = await page.evaluate(
      () => window.gstmxxRealtime.getState().sampleCount,
    );
    await expect.poll(
      () => page.evaluate(() => window.gstmxxRealtime.getState().sampleCount),
    ).toBeGreaterThan(applyingSampleCount);

    await page.evaluate(() => { window.__rtPoseShift = 0.02; });
    await page.locator('#btn-measure-change').click();
    await expect(page.locator('#distance-value')).toHaveText('—');
    await expect(page.locator('#session-result')).toContainText('baseline pose');

    await page.evaluate(() => {
      window.__rtPoseShift = 0;
      window.__rtDescriptorShift = 0.2;
      window.__rtAppearanceChange = true;
    });

    await expect.poll(
      () => page.evaluate(() => {
        const state = window.gstmxxRealtime.getState();
        return { step: state.sessionStep, phase: state.sessionPhase, captures: state.captureCount };
      }),
      { timeout: 20000 },
    ).toEqual({ step: 1, phase: 'ready', captures: 1 });
    const state = await page.evaluate(() => window.gstmxxRealtime.getState());
    expect(state.sessionPhase).toBe('ready');
    expect(state.lastMeasurement.distance).toBeCloseTo(0.2, 3);
    expect(state.lastMeasurement.spread).toBeCloseTo(0, 3);
    expect(state.eventCount).toBeGreaterThanOrEqual(3);
    expect(state.captureCount).toBe(1);
    await expect(page.locator('#session-result')).toContainText('Snapshot d=0.200');
    await expect(page.locator('#radial-graph')).toBeVisible();

    // Local-video baselines are intentionally session-only: after reload the
    // original blob is gone and must never be confused with the camera source.
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.gstmxxRealtime?.getState().running)).toBe(true);
    expect(await page.evaluate(() => window.gstmxxRealtime.getState().hasBaseline)).toBe(false);
  });

  test('keeps local-video analysis available when camera permission fails', async ({ page }) => {
    await mockRealtimeModels(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw new Error('permission denied'); } },
      });
    });
    await page.goto('/realtime.html');
    await expect(page.locator('#status-pill')).toContainText('Camera unavailable');
    await expect(page.locator('#video-upload')).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.gstmxxRealtime.getState().running)).toBe(true);
    await expect(page.locator('#btn-baseline-start')).toBeVisible();
  });
});
