import { test, expect } from '@playwright/test';

test.describe('Ghostmaxxing Face Matching E2E', () => {
  test('recognizes a saved face and reports a non-match when distance is above threshold', async ({ page }) => {
    test.setTimeout(90000);

    await page.addInitScript(() => {
      localStorage.removeItem('local-face-lab-db-v1');
      localStorage.removeItem('local-face-lab-db-3d-v1');
      localStorage.removeItem('ghostati-overlay-mode-v1');
    });

    await page.goto('/lab.html');

    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker pronto', { timeout: 45000 });
    await expect(page.locator('#logBox')).toContainText('Webcam attiva', { timeout: 45000 });

    await expect(page.locator('#dbCount')).toHaveText('0');
    await expect(page.locator('#gm-num')).toHaveText('—');
    await expect(page.locator('#gm-state')).toHaveText('Save your face');

    await page.locator('#saveBtn').click();

    await expect(page.locator('#dbCount')).toHaveText('1', { timeout: 45000 });
    await expect(page.locator('#nextId')).toHaveText('1');
    await expect(page.locator('#logBox')).toContainText('Impronta biometrica salvata con ID 0', { timeout: 45000 });
    await expect(page.locator('#gm-num')).toHaveText('0.00');
    await expect(page.locator('#gm-state')).toHaveText(/Recognised\s+·\s+#0/);

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
