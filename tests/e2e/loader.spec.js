import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * Installs deterministic model bundles so browser tests exercise the complete
 * Video Loader orchestration without spending CI time on real inference.
 *
 * @param {import('@playwright/test').Page} page Playwright page.
 * @returns {Promise<void>}
 */
async function mockModels(page) {
  await page.route('/lab-js/vendor/face-api.js', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        (() => {
          let recognitionRuns = 0;
          const descriptor = () => {
            recognitionRuns += 1;
            const vector = new Float32Array(128);
            if (recognitionRuns > 3) vector[0] = 0.75;
            return vector;
          };
          window.faceapi = {
            TinyFaceDetectorOptions: class TinyFaceDetectorOptions { constructor(options) { this.options = options; } },
            nets: {
              tinyFaceDetector: { loadFromUri: async () => {} },
              faceLandmark68Net: { loadFromUri: async () => {} },
              faceRecognitionNet: { loadFromUri: async () => {} },
            },
            detectSingleFace: () => ({
              withFaceLandmarks: () => ({
                withFaceDescriptor: async () => ({
                  detection: { score: 0.98, box: { x: 180, y: 80, width: 280, height: 280 } },
                  landmarks: { positions: Array.from({ length: 68 }, () => ({ x: 300, y: 220 })) },
                  descriptor: descriptor(),
                }),
              }),
            }),
          };
        })();
      `,
    });
  });

  await page.route('/lab-js/vendor/tasks-vision@0.10.35.js', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        let embedRuns = 0;
        const landmarks = Array.from({ length: 478 }, (_, index) => {
          const angle = (index / 478) * Math.PI * 2;
          return { x: 0.5 + Math.cos(angle) * 0.2, y: 0.5 + Math.sin(angle) * 0.28, z: 0 };
        });
        landmarks[33] = { x: 0.41, y: 0.42, z: 0 };
        landmarks[263] = { x: 0.59, y: 0.42, z: 0 };
        landmarks[1] = { x: 0.5, y: 0.52, z: 0 };
        export class FilesetResolver { static async forVisionTasks() { return {}; } }
        export class FaceLandmarker {
          static async createFromOptions() {
            return { detect: () => ({ faceLandmarks: [landmarks] }) };
          }
        }
        export class ImageEmbedder {
          static async createFromOptions() {
            return {
              embed: () => {
                embedRuns += 1;
                return { embeddings: [{ floatEmbedding: new Float32Array(embedRuns <= 8 ? [1, 0, 0] : [0, 1, 0]) }] };
              },
            };
          }
        }
      `,
    });
  });
}

test.describe('seekable Video Loader', () => {
  test.beforeEach(async ({ page }) => {
    await mockModels(page);
  });

  test('boots as an existing-video analyser without camera controls', async ({ page }) => {
    await page.goto('/loader.html');
    await expect(page.getByRole('heading', { name: 'Makeup video analyser' })).toBeVisible();
    await expect(page.getByLabel('Local video source')).toBeVisible();
    await expect(page.getByLabel('Analysis controls')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evidence and story order' })).toBeVisible();
    await expect(page.getByText('Select a local MP4, WebM, or compatible video to begin.')).toBeVisible();
    await expect(page.locator('#statusText')).toHaveText('select a local video', { timeout: 5000 });
    await expect(page.locator('#startAnalysisBtn')).toBeDisabled();
    await expect(page.locator('text=webcam')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.gstmxxVideoLoader?.isModelsReady())).toBe(true);
  });

  test('loads through setInputFiles and produces separate report and technical log artifacts', async ({ page }) => {
    await page.addInitScript(() => {
      CanvasRenderingContext2D.prototype.drawImage = function drawImage() {};
      CanvasRenderingContext2D.prototype.getImageData = function getImageData(x, y, width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let offset = 0; offset < data.length; offset += 4) {
          data[offset] = 128;
          data[offset + 1] = 128;
          data[offset + 2] = 128;
          data[offset + 3] = 255;
        }
        return { data, width, height };
      };
    });
    await page.goto('/loader.html');
    await expect.poll(() => page.evaluate(() => window.gstmxxVideoLoader?.isModelsReady())).toBe(true);
    await page.evaluate(() => window.gstmxxVideoLoader.setSourceMetadata({ fingerprint: 'sampled-sha256:e2e' }));
    await page.setInputFiles('#videoFile', path.join(process.cwd(), 'tests/fixtures/my-moving-face.mp4'));

    await expect.poll(() => page.evaluate(() => window.gstmxxVideoLoader?.isSourceLoaded())).toBe(true);
    await expect(page.locator('#startAnalysisBtn')).toBeEnabled();
    await page.evaluate(() => window.gstmxxVideoLoader.analyze({ end: 6, sampleIntervalSeconds: 0.5 }));

    await expect(page.locator('#analysisProgressLabel')).toHaveText('100%');
    await expect(page.locator('#reportSummary')).toContainText('confirmed event');
    await expect(page.locator('.loader-event--confirmed')).toHaveCount(1);
    await expect(page.locator('#downloadReportBtn')).toBeEnabled();
    await expect(page.locator('#downloadLogBtn')).toBeEnabled();

    const exported = await page.evaluate(() => {
      const bundle = window.gstmxxVideoLoader.exportBundle();
      return {
        reportEvents: bundle.report.events.length,
        reportHasImageBytes: JSON.stringify(bundle.report).includes('base64'),
        logHasImageBytes: bundle.technicalLog.includes('base64'),
        logTypes: bundle.technicalLog.trim().split('\n').map(line => JSON.parse(line).type),
        frames: bundle.frames.map(frame => frame.id),
        fingerprint: bundle.report.source.fingerprint,
        eventFrameReason: bundle.report.events[0]?.selectedFrame?.reason,
        storyOrder: bundle.report.storyOrder,
      };
    });
    expect(exported).toMatchObject({
      reportEvents: 1,
      reportHasImageBytes: false,
      logHasImageBytes: false,
      fingerprint: 'sampled-sha256:e2e',
    });
    expect(exported.logTypes).toContain('analysis-header');
    expect(exported.logTypes).toContain('evidence-refinement-check');
    expect(exported.logTypes).toContain('evidence-frame-selected');
    expect(exported.logTypes).toContain('analysis-footer');
    expect(exported.frames).toContain('baseline');
    expect(exported.frames).toHaveLength(2);
    expect(exported.eventFrameReason).toMatch(/^refined-/);
    expect(exported.storyOrder).toContain('baseline');
  });
});
