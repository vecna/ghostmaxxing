/**
 * ==Ghostyle==
 * @name         Template
 * @version      2.0.0
 * @author       vecna
 * @release_date 2026-06-29
 * @description  Canonical template for Ghostmaxxing plugins: minimal example with 2D + UV callbacks.
 * ==/Ghostyle==
 */

/**
 * This file is intentionally heavily commented. Its purpose is not the visual
 * effect itself, but to demonstrate how to build a plugin compatible with the
 * unified model (onInit, onDraw, paintUV, and onClear).
 *
 * @module ghostyles/00-template
 */

const G = window.gstmxx || window.Ghostmaxxing || window.Ghostati;

/**
 * Initialization callback called when the plugin is loaded or activated.
 * Used to set up any initial state, perform one-time calculations, or log initialization.
 *
 * @returns {string|void} An optional initialization message.
 */
export function onInit() {
  if (G && typeof G.log === 'function') {
    G.log('Template plugin initialized.', 'Template');
  }
  return 'Template initialized';
}

/**
 * 2D callback called during the face-api rendering tick.
 *
 * For a teaching template, we want a minimal visual action: a thin circle
 * centered on the nose. We avoid complex shapes to keep the template easy
 * to understand and copy.
 *
 * @param {CanvasRenderingContext2D} ctx - The overlay canvas 2D rendering context.
 * @param {object} landmarks - The face-api landmarks object containing facial features.
 */
export function onDraw(ctx, landmarks) {
  // Nose landmarks contain 9 points. The centroid is the geometric average
  // of the area, which is robust even if the face rotates slightly.
  const nose = landmarks.getNose();
  const c = G.avgPoint(nose);

  // The radius scales with the vertical length of the nose to adapt to
  // larger/smaller faces without using hardcoded absolute pixel values.
  const radius = Math.max(8, G.distance(nose[0], nose[6]) * 0.18);

  // Draw a subtle thin circle so the template doesn't dominate the frame.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(235, 245, 255, 0.85)';
  ctx.stroke();
  ctx.restore();
}

/**
 * UV callback called during the MediaPipe rendering tick.
 *
 * This draws a semi-transparent band in the forehead area of the UV texture.
 * It demonstrates that paintUV does not draw directly on the screen/video space,
 * but on the canonical face texture which is then warped onto the 3D face mesh.
 *
 * @param {CanvasRenderingContext2D} ctx - The UV texture canvas 2D context.
 */
export function paintUV(ctx) {
  // It is not necessary to know all 478 indices for a basic example: we draw
  // a band across the upper section of the UV texture, where the forehead is located.
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Use a highly readable yet semi-transparent color to see the overlay effect.
  ctx.save();
  ctx.fillStyle = 'rgba(90, 210, 235, 0.22)';

  // Horizontal band with side margins to avoid drawing on the very edge of the texture.
  const x = w * 0.18;
  const y = h * 0.08;
  const bw = w * 0.64;
  const bh = h * 0.16;
  ctx.fillRect(x, y, bw, bh);

  // A subtle border helps outline the shape's boundaries on the UV map.
  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.strokeStyle = 'rgba(225, 250, 255, 0.4)';
  ctx.strokeRect(x, y, bw, bh);
  ctx.restore();
}

/**
 * Cleanup callback called when the plugin is unloaded or deactivated.
 * Used to clean up any custom event listeners, timers, or custom drawing state.
 *
 * @param {CanvasRenderingContext2D} ctx - The overlay canvas 2D rendering context.
 */
export function onClear(ctx) {
  if (G && typeof G.log === 'function') {
    G.log('Template plugin cleared.', 'Template');
  }
}
