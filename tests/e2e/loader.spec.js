import { test, expect } from '@playwright/test';

test.describe('MP4 loader tool', () => {
  test('boots the internal loader interface with mocked model runtimes', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('local-face-lab-db-v1');
      localStorage.removeItem('local-face-lab-db-3d-v1');
      localStorage.removeItem('local-face-lab-thumbnails-v1');
      localStorage.removeItem('ghostati-overlay-mode-v1');
      localStorage.removeItem('ghostmaxxing-locale');
    });

    await page.route(/(cdn\.jsdelivr\.net\/npm\/@vladmandic\/face-api\/dist\/face-api\.js|\/scripts\/vendor\/face-api\.js)$/, (route) => {
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

    await page.route(/(cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@0\.10\.35|\/scripts\/vendor\/tasks-vision@0\.10\.35\.js)$/, (route) => {
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
    await page.locator('#localeSelect').selectOption('it');
    await expect(page.getByRole('heading', { name: 'Loader di test video makeup' })).toBeVisible();
    await expect(page.getByText('Seleziona un video MP4 locale per iniziare.')).toBeVisible();
    await expect(page.locator('#statusText')).toHaveText('pronto');
    await expect(page.locator('#recordFaceBtn')).toBeDisabled();
    await expect(page.locator('#seekFaceBtn')).toBeDisabled();
  });

  test('loads a mock video and enables/executes face actions', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('local-face-lab-db-v1');
      localStorage.removeItem('local-face-lab-db-3d-v1');
      localStorage.removeItem('local-face-lab-thumbnails-v1');
      localStorage.removeItem('ghostati-overlay-mode-v1');
      localStorage.removeItem('ghostmaxxing-locale');
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        if (type === 'image/jpeg' && quality === 0.8) return 'data:image/jpeg;base64,loader-preview';
        return originalToDataURL.call(this, type, quality);
      };
      CanvasRenderingContext2D.prototype.drawImage = function() {};
    });

    await page.route(/(cdn\.jsdelivr\.net\/npm\/@vladmandic\/face-api\/dist\/face-api\.js|\/scripts\/vendor\/face-api\.js)$/, (route) => {
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
            detectSingleFace: () => {
              const landmarks = {
                positions: Array.from({ length: 68 }, (_, i) => ({ x: 100 + i, y: 120 + i })),
                getLeftEye: () => [{ x: 230, y: 220 }, { x: 250, y: 220 }],
                getRightEye: () => [{ x: 320, y: 220 }, { x: 340, y: 220 }],
                getNose: () => [{ x: 280, y: 240 }, { x: 282, y: 252 }, { x: 284, y: 264 }, { x: 286, y: 276 }],
                getJawOutline: () => [{ x: 220, y: 300 }, { x: 280, y: 335 }, { x: 350, y: 300 }],
                getMouth: () => [{ x: 260, y: 310 }, { x: 275, y: 318 }, { x: 290, y: 320 }, { x: 305, y: 318 }, { x: 320, y: 310 }, { x: 290, y: 326 }, { x: 275, y: 318 }],
              };
              const result = {
                detection: { score: 0.93, box: { x: 210, y: 160, width: 180, height: 220 } },
                landmarks,
                age: 31,
                gender: 'female',
                genderProbability: 0.82,
                descriptor: Array.from({ length: 128 }, (_, i) => i / 128),
              };
              return {
                withFaceLandmarks: () => ({
                  withAgeAndGender: () => ({
                    withFaceDescriptor: async () => result,
                  }),
                }),
              };
            },
            resizeResults: (result) => result,
          };
        `,
      });
    });

    await page.route(/(cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@0\.10\.35|\/scripts\/vendor\/tasks-vision@0\.10\.35\.js)$/, (route) => {
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
    await expect(page.locator('#loaderLog')).toContainText('preview: saved');
    await expect.poll(async () => page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('local-face-lab-thumbnails-v1') || '{"entries":[]}');
      const first = store.entries[0] || {};
      return {
        count: store.entries.length,
        id: first.id,
        dataUrl: first.dataUrl,
        hasSavedAt: typeof first.savedAt === 'string' && first.savedAt.length > 0,
      };
    })).toEqual({
      count: 1,
      id: 0,
      dataUrl: 'data:image/jpeg;base64,loader-preview',
      hasSavedAt: true,
    });

    // Click Seek face
    await page.locator('#seekFaceBtn').click();
    await expect(page.locator('#loaderLog .loader-entry')).toHaveCount(2);
    await expect(page.locator('#loaderLog')).toContainText('#2 seek face');
  });
});
