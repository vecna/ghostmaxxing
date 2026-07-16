import { test, expect } from '@playwright/test';

function makeLandmarks478() {
  return Array.from({ length: 478 }, (_, index) => ({
    x: (index % 20) / 20,
    y: (index % 24) / 24,
    z: index / 478,
  }));
}

test.describe('Ghostmaxxing Overlay Mode E2E', () => {
  test('switches the lab view tabs, stores overlay mode, renders 2D/3D overlays, and suppresses after save', async ({ page }) => {
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

    await page.goto('/lab.html');

    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker ready', { timeout: 45000 });
    await expect(page.locator('#logBox')).toContainText('Webcam active', { timeout: 45000 });

    const viewer = page.locator('#viewer');
    const bboxOverlay = page.locator('#bboxOverlay');
    const cameraTab = page.getByRole('tab', { name: 'Camera' });
    const points2dTab = page.getByRole('tab', { name: '2D points' });
    const mesh3dTab = page.getByRole('tab', { name: '3D mesh' });

    const expectSelectedView = async ({ selected, view, overlayMode, bboxHidden }) => {
      await expect(selected).toHaveAttribute('aria-selected', 'true');
      for (const tab of [cameraTab, points2dTab, mesh3dTab]) {
        if (tab !== selected) await expect(tab).toHaveAttribute('aria-selected', 'false');
      }
      await expect(viewer).toHaveAttribute('data-view', view);
      if (bboxHidden) await expect(bboxOverlay).toHaveClass(/gm-canvas-hidden/);
      else await expect(bboxOverlay).not.toHaveClass(/gm-canvas-hidden/);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe(overlayMode);
    };

    await cameraTab.click();
    await expectSelectedView({ selected: cameraTab, view: 'off', overlayMode: 'bbox', bboxHidden: true });

    await points2dTab.click();
    await expectSelectedView({ selected: points2dTab, view: '2d', overlayMode: '2d', bboxHidden: false });

    await cameraTab.click();
    await expectSelectedView({ selected: cameraTab, view: 'off', overlayMode: 'bbox', bboxHidden: true });

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

    await mesh3dTab.click();
    await expectSelectedView({ selected: mesh3dTab, view: '3d', overlayMode: 'mesh', bboxHidden: false });
    await expect(await dispatchSyntheticOverlayData()).toEqual({
      strokeRect: 0,
      arc: 478,
      clearRect: 3,
      fillText: 0,
    });

    await points2dTab.click();
    await expectSelectedView({ selected: points2dTab, view: '2d', overlayMode: '2d', bboxHidden: false });
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
