import { test, expect } from '@playwright/test';

function makeLandmarks478() {
  return Array.from({ length: 478 }, (_, index) => ({
    x: (index % 20) / 20,
    y: (index % 24) / 24,
    z: index / 478,
  }));
}

test.describe('Ghostmaxxing Overlay Mode E2E', () => {
  test('cycles overlay modes, persists selection, renders mesh/bbox, and suppresses after save', async ({ page }) => {
    test.setTimeout(90000);

    await page.addInitScript(() => {
      window.__captureBboxOverlay = false;
      window.__bboxOverlayCounters = { strokeRect: 0, arc: 0, clearRect: 0, fillText: 0 };
      window.__resetBboxOverlayCounters = () => {
        window.__bboxOverlayCounters.strokeRect = 0;
        window.__bboxOverlayCounters.arc = 0;
        window.__bboxOverlayCounters.clearRect = 0;
        window.__bboxOverlayCounters.fillText = 0;
      };

      const counters = window.__bboxOverlayCounters;
      const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;
      const originalArc = CanvasRenderingContext2D.prototype.arc;
      const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
      const originalFillText = CanvasRenderingContext2D.prototype.fillText;

      CanvasRenderingContext2D.prototype.strokeRect = function (...args) {
        if (window.__captureBboxOverlay && this.canvas && this.canvas.id === 'bboxOverlay') counters.strokeRect += 1;
        return originalStrokeRect.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (window.__captureBboxOverlay && this.canvas && this.canvas.id === 'bboxOverlay') counters.arc += 1;
        return originalArc.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (window.__captureBboxOverlay && this.canvas && this.canvas.id === 'bboxOverlay') counters.clearRect += 1;
        return originalClearRect.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.fillText = function (...args) {
        if (window.__captureBboxOverlay && this.canvas && this.canvas.id === 'bboxOverlay') counters.fillText += 1;
        return originalFillText.apply(this, args);
      };
    });

    await page.goto('/ghostati.html');

    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker pronto', { timeout: 45000 });
    await expect(page.locator('#logBox')).toContainText('Webcam attiva', { timeout: 45000 });

    const overlayModeBtn = page.locator('#overlayModeBtn');
    await expect(overlayModeBtn).toHaveText('Vista: bbox');

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: mesh');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe('mesh');

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: entrambi');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe('entrambi');

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: 2D');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe('2d');

    await page.reload();
    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker pronto', { timeout: 45000 });
    await expect(overlayModeBtn).toHaveText('Vista: 2D');

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: bbox');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe('bbox');

    const dispatchSyntheticOverlayData = async (source = 'auto') => {
      return page.evaluate(({ landmarks, source }) => {
        const detection = {
          detection: {
            score: 0.91,
            box: { x: 10, y: 20, width: 100, height: 120 }
          }
        };

        window.gstmxx.events.dispatchEvent(new CustomEvent('detection', {
          detail: { result: null }
        }));
        window.gstmxx.events.dispatchEvent(new CustomEvent('landmarks3d', {
          detail: { landmarks: null }
        }));
        window.__resetBboxOverlayCounters();
        window.__captureBboxOverlay = true;

        window.gstmxx.events.dispatchEvent(new CustomEvent('matchStateChanged', {
          detail: {
            source,
            overall: 'matched',
            faceapi: {
              detectionState: 'matched',
              liveMinDist: 0.12,
              liveMinId: 0
            }
          }
        }));

        window.gstmxx.events.dispatchEvent(new CustomEvent('detection', {
          detail: { result: detection }
        }));
        window.gstmxx.events.dispatchEvent(new CustomEvent('landmarks3d', {
          detail: { landmarks }
        }));
        window.__captureBboxOverlay = false;
        return { ...window.__bboxOverlayCounters };
      }, { landmarks, source });
    };

    const dispatchSyntheticDetailedOverlayData = async () => {
      return page.evaluate(() => {
        const leftEye = [{ x: 20, y: 30 }, { x: 24, y: 28 }, { x: 28, y: 29 }, { x: 30, y: 31 }, { x: 27, y: 34 }, { x: 22, y: 34 }];
        const rightEye = [{ x: 70, y: 30 }, { x: 74, y: 28 }, { x: 78, y: 29 }, { x: 80, y: 31 }, { x: 77, y: 34 }, { x: 72, y: 34 }];
        const nose = [{ x: 48, y: 36 }, { x: 49, y: 42 }, { x: 50, y: 48 }, { x: 47, y: 55 }, { x: 50, y: 56 }, { x: 53, y: 55 }];
        const jaw = [{ x: 14, y: 60 }, { x: 22, y: 70 }, { x: 34, y: 78 }, { x: 50, y: 82 }, { x: 66, y: 78 }, { x: 78, y: 70 }, { x: 86, y: 60 }];
        const mouth = [{ x: 36, y: 66 }, { x: 42, y: 64 }, { x: 50, y: 63 }, { x: 58, y: 64 }, { x: 64, y: 66 }, { x: 58, y: 71 }, { x: 50, y: 72 }, { x: 42, y: 71 }];

        const detection = {
          detection: {
            score: 0.91,
            box: { x: 10, y: 20, width: 100, height: 120 }
          },
          age: 29,
          gender: 'female',
          landmarks: {
            getLeftEye: () => leftEye,
            getRightEye: () => rightEye,
            getNose: () => nose,
            getJawOutline: () => jaw,
            getMouth: () => mouth,
          }
        };

        window.gstmxx.events.dispatchEvent(new CustomEvent('detection', {
          detail: { result: null }
        }));
        window.gstmxx.events.dispatchEvent(new CustomEvent('landmarks3d', {
          detail: { landmarks: null }
        }));
        window.__resetBboxOverlayCounters();
        window.__captureBboxOverlay = true;
        window.gstmxx.events.dispatchEvent(new CustomEvent('matchStateChanged', {
          detail: {
            source: 'auto',
            overall: 'matched',
            faceapi: {
              detectionState: 'matched',
              liveMinDist: 0.12,
              liveMinId: 0
            }
          }
        }));
        window.gstmxx.events.dispatchEvent(new CustomEvent('detection', {
          detail: { result: detection }
        }));
        window.__captureBboxOverlay = false;
        return { ...window.__bboxOverlayCounters };
      });
    };

    const landmarks = makeLandmarks478();

    await expect(await dispatchSyntheticOverlayData()).toEqual({
      strokeRect: 2,
      arc: 0,
      clearRect: 3,
      fillText: 6,
    });

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: mesh');
    await expect(await dispatchSyntheticOverlayData()).toEqual({
      strokeRect: 0,
      arc: 478,
      clearRect: 3,
      fillText: 0,
    });

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: entrambi');
    await expect(await dispatchSyntheticOverlayData()).toEqual({
      strokeRect: 2,
      arc: 478,
      clearRect: 3,
      fillText: 6,
    });

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: 2D');
    await expect(await dispatchSyntheticDetailedOverlayData()).toEqual({
      strokeRect: 1,
      arc: 4,
      clearRect: 2,
      fillText: 3,
    });

    await expect(await dispatchSyntheticOverlayData('save')).toEqual({
      strokeRect: 0,
      arc: 0,
      clearRect: 3,
      fillText: 0,
    });
  });
});