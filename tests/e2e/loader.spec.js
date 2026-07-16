import { test, expect } from '@playwright/test';

test.describe('MP4 loader tool', () => {
  test('boots the internal loader interface with mocked model runtimes', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('local-face-lab-db-v1');
      localStorage.removeItem('local-face-lab-db-3d-v1');
      localStorage.removeItem('ghostati-overlay-mode-v1');
    });

    await page.route('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js', (route) => {
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.faceapi = {
            TinyFaceDetectorOptions: class TinyFaceDetectorOptions { constructor(opts) { this.opts = opts; } },
            nets: {
              tinyFaceDetector: { loadFromUri: async () => {} },
              faceLandmark68Net: { loadFromUri: async () => {} },
              faceRecognitionNet: { loadFromUri: async () => {} },
              ageGenderNet: { loadFromUri: async () => {} },
            },
            detectSingleFace: () => null,
            resizeResults: (result) => result,
          };
        `,
      });
    });

    await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35', (route) => {
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          export class FilesetResolver {
            static async forVisionTasks() { return {}; }
          }
          export class ImageEmbedder {
            static async createFromOptions() {
              return { embedForVideo: () => ({ embeddings: [{ floatEmbedding: new Float32Array([1, 0, 0]) }] }) };
            }
          }
          export class FaceLandmarker {
            static async createFromOptions() {
              return { detectForVideo: () => ({ faceLandmarks: [] }) };
            }
          }
        `,
      });
    });

    await page.goto('/loader.html');

    await expect(page.getByRole('heading', { name: 'Makeup Video Test Loader' })).toBeVisible();
    await expect(page.getByLabel('Load and play video')).toBeVisible();
    await expect(page.getByLabel('Face actions')).toBeVisible();
    await expect(page.getByLabel('Button activity log')).toBeVisible();
    await expect(page.getByText('Select a local MP4 video to begin.')).toBeVisible();
    await expect(page.locator('#statusText')).toHaveText('ready', { timeout: 5000 });
    await expect(page.locator('#recordFaceBtn')).toBeDisabled();
    await expect(page.locator('#seekFaceBtn')).toBeDisabled();
  });

  test('loads a mock video and enables/executes face actions', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('local-face-lab-db-v1');
      localStorage.removeItem('local-face-lab-db-3d-v1');
      localStorage.removeItem('ghostati-overlay-mode-v1');
    });

    await page.route('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js', (route) => {
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.faceapi = {
            TinyFaceDetectorOptions: class TinyFaceDetectorOptions { constructor(opts) { this.opts = opts; } },
            nets: {
              tinyFaceDetector: { loadFromUri: async () => {} },
              faceLandmark68Net: { loadFromUri: async () => {} },
              faceRecognitionNet: { loadFromUri: async () => {} },
              ageGenderNet: { loadFromUri: async () => {} },
            },
            detectSingleFace: () => null,
            resizeResults: (result) => result,
          };
        `,
      });
    });

    await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35', (route) => {
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          export class FilesetResolver {
            static async forVisionTasks() { return {}; }
          }
          export class ImageEmbedder {
            static async createFromOptions() {
              return { embedForVideo: () => ({ embeddings: [{ floatEmbedding: new Float32Array([1, 0, 0]) }] }) };
            }
          }
          export class FaceLandmarker {
            static async createFromOptions() {
              return { detectForVideo: () => ({ faceLandmarks: [] }) };
            }
          }
        `,
      });
    });

    await page.goto('/loader.html');

    // Wait for the models to be ready
    await expect(page.locator('#statusText')).toHaveText('ready', { timeout: 5000 });

    // Upload a mock MP4 file
    await page.setInputFiles('#videoFile', {
      name: 'mock-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake mp4 data'),
    });

    // Mock HTMLVideoElement properties and dispatch loaded metadata/data events
    await page.evaluate(() => {
      const video = document.getElementById('video');
      Object.defineProperties(video, {
        duration: { value: 12.5, configurable: true },
        currentTime: { value: 3.2, configurable: true },
        readyState: { value: 4, configurable: true },
        videoWidth: { value: 1280, configurable: true },
        videoHeight: { value: 720, configurable: true },
      });
      video.dispatchEvent(new Event('loadedmetadata'));
      video.dispatchEvent(new Event('loadeddata'));
    });

    // Verify timeline UI is updated and seek bar is active
    await expect(page.locator('#durationLabel')).toHaveText('00:12.500');
    await expect(page.locator('#currentTimeLabel')).toHaveText('00:03.200');

    // Buttons should now be enabled
    await expect(page.locator('#recordFaceBtn')).toBeEnabled();
    await expect(page.locator('#seekFaceBtn')).toBeEnabled();

    // Click Record face
    await page.locator('#recordFaceBtn').click();
    await expect(page.locator('#loaderLog .loader-entry')).toHaveCount(1);
    await expect(page.locator('#loaderLog')).toContainText('#1 record face');

    // Click Seek face
    await page.locator('#seekFaceBtn').click();
    await expect(page.locator('#loaderLog .loader-entry')).toHaveCount(2);
    await expect(page.locator('#loaderLog')).toContainText('#2 seek face');
  });
});
