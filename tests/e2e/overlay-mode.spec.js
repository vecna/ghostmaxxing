import { expect, test } from '@playwright/test';
import { mockWorkshopDetector } from './helpers/workshop.js';

test('independently combines and clears the 2D points and 3D mesh', async ({ page }) => {
   await mockWorkshopDetector(page);
   let meshRequests = 0;
   await page.route('/lab-js/vendor/tasks-vision@0.10.35.js', route => {
      meshRequests += 1;
      return route.fulfill({
         contentType: 'application/javascript',
         body: `
            export class FilesetResolver { static async forVisionTasks() { return {}; } }
            export class FaceLandmarker {
               static async createFromOptions() {
                  return { detectForVideo: () => ({
                     faceLandmarks: [Array.from({ length: 478 }, (_, index) => ({
                        x: 0.4 + index * 0.0002, y: 0.5,
                     }))],
                  }) };
               }
            }
         `,
      });
   });
   await page.goto('/lab.html');
   await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
   const two = page.getByRole('button', { name: '2D points', exact: true });
   const three = page.getByRole('button', { name: '3D mesh', exact: true });
   const points = page.locator('#landmarks-2d');
   const mesh = page.locator('#landmarks-3d');

   /** Reads actual painted pixels so this exercise covers the canvas, not only its marker. */
   const alpha = canvas => canvas.evaluate(element => {
      const data = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
      return data.some((value, index) => index % 4 === 3 && value > 0);
   });
   const expectView = async (show2d, show3d) => {
      await expect(two).toHaveAttribute('aria-pressed', String(show2d));
      await expect(three).toHaveAttribute('aria-pressed', String(show3d));
      await expect.poll(() => alpha(points)).toBe(show2d);
      await expect.poll(() => alpha(mesh)).toBe(show3d);
   };
   await expectView(false, false);
   expect(meshRequests).toBe(0);
   await two.click();
   await expectView(true, false);
   await three.click();
   await expectView(true, true);
   await two.click();
   await expectView(false, true);
   await three.click();
   await expectView(false, false);
   expect(meshRequests).toBe(1);
});
