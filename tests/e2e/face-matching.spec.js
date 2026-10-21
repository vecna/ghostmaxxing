import { test, expect } from '@playwright/test';
import { prepareRealFaceApiLab } from './helpers/real-faceapi.js';

test.describe('Ghostmaxxing Face Matching E2E', () => {
  test('recognizes a saved face and reports a non-match when distance is above threshold', async ({ page }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => {
      localStorage.removeItem('local-face-lab-db-v1');
      localStorage.removeItem('local-face-lab-db-3d-v1');
      localStorage.removeItem('ghostati-overlay-mode-v1');
      // Real pixels from a committed image, delivered as a real MediaStream.
      // Identity matching must not depend on where a moving fake-camera clip
      // happens to be when the model finishes loading.
      navigator.mediaDevices.getUserMedia = async () => {
        const image = new Image();
        image.src = '/tests/fixtures/mock-face.jpg';
        await image.decode();
        const canvas = document.createElement('canvas');
        const scale = 640 / Math.max(image.naturalWidth, image.naturalHeight);
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext('2d');
        const draw = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
        draw();
        const stream = canvas.captureStream(5);
        const timer = window.setInterval(draw, 200);
        stream.getVideoTracks()[0].addEventListener('ended', () => window.clearInterval(timer));
        return stream;
      };
    });

    await prepareRealFaceApiLab(page, '/lab-js/main.js');
    // Recognition is tested without optional Ghostyle/UV initialisation.
    // Those effects have their own tests; a new plugin must not change this
    // test's baseline or consume its inference budget.
    await page.route('/ghostyles.json', (route) => route.fulfill({ json: [] }));
    await page.goto('/lab.html');

    // The visible log is a rotating window and may already have dropped a
    // readiness line. This 2D matching test needs a decoded camera frame and
    // an enabled save control, not the separate FaceLandmarker loop's log.
    await expect.poll(() => page.locator('#video').evaluate(
      (video) => video.readyState >= 2 && video.videoWidth > 0,
    ), { timeout: 60000 }).toBe(true);
    await expect(page.locator('#saveBtn')).toBeEnabled({ timeout: 60000 });

    // Compare the same real frame while saving and matching.
    await page.locator('#video').evaluate((video) => video.pause());
    await expect.poll(() => page.evaluate(async () => {
      const { detectFaceInCam } = await import('/lab-js/engine.js');
      const result = await detectFaceInCam(false);
      return result?.descriptor?.length;
    }), { timeout: 45000 }).toBe(128);

    await expect(page.locator('#dbCount')).toHaveText('0');
    await expect(page.locator('#gm-num')).toHaveText('—');
    await expect(page.locator('#gm-state')).toHaveText('Save your face');

    await page.locator('#saveBtn').click();

    await expect(page.locator('#dbCount')).toHaveText('1', { timeout: 45000 });
    await expect(page.locator('#nextId')).toHaveText('1');
    await expect.poll(() => page.evaluate(() => {
      const saved = window.gstmxx.getDb().faces.find((face) => face.id === 0);
      return saved?.descriptor?.length;
    }), { timeout: 45000 }).toBe(128);
    // Check real recognition of the saved frame as well as the UI state.
    await expect.poll(() => page.evaluate(() => {
      const distance = Number(document.getElementById('gm-num').textContent);
      const threshold = Number(document.getElementById('gm-thr-input').value);
      const state = document.getElementById('gm-state').textContent;
      return Number.isFinite(distance) && distance >= 0 && distance < threshold
        && /Recognised\s+·\s+#0/.test(state);
    }), { timeout: 45000 }).toBe(true);

    const nonMatchReadout = await page.evaluate(() => {
      window.gstmxx.events.dispatchEvent(new CustomEvent('matchStateChanged', {
        detail: {
          source: 'auto',
          overall: 'eluded',
          faceapi: {
            detectionState: 'eluded',
            distance: 0.91,
            matchedId: null,
            liveMinDist: 0.91,
            liveMinId: 0,
            obfMinDist: null,
            obfMinId: null,
          },
          mediapipe: null,
        },
      }));

      return {
        number: document.getElementById('gm-num').textContent,
        state: document.getElementById('gm-state').textContent,
        broke: document.getElementById('readout').classList.contains('broke'),
      };
    });

    expect(nonMatchReadout).toEqual({
      number: '0.91',
      state: 'Escaped · #0',
      broke: true,
    });
  });
});
