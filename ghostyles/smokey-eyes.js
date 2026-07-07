/**
 * ==Ghostyle==
 * @name         Smokey Eyes (split demo)
 * @version      2.0.0
 * @author       vecna, but actually inspired by a paper.
 * @release_date 2025-01-01
 * @description  Demo split: pixel-space su meta' sinistra, UV-space su meta' destra.
 * ==/Ghostyle==
 */

/**
 * Meta' sinistra: landmark face-api, disegno diretto in pixel-space.
 * Il clip evita sovrapposizioni con la controparte UV della meta' destra.
 */
export function onDraw(ctx, landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();

  ctx.save();
  if (!gstmxx.clipLeftHalf(ctx, landmarks)) {
    ctx.restore();
    return;
  }

  const leftShape = gstmxx.expandEyePolygon(leftEye, leftBrow, 1.32, 0.8).map((p) => gstmxx.point(p.x - 8, p.y + 4));
  const rightShape = gstmxx.expandEyePolygon(rightEye, rightBrow, 1.32, 0.8).map((p) => gstmxx.point(p.x + 8, p.y + 4));

  gstmxx.drawClosedPath(ctx, leftShape, 'rgba(125, 86, 172, 0.32)', 'rgba(194, 157, 255, 0.44)', 2);
  gstmxx.drawClosedPath(ctx, rightShape, 'rgba(125, 86, 172, 0.32)', 'rgba(194, 157, 255, 0.44)', 2);
  gstmxx.drawOpenPath(ctx, [leftEye[0], leftEye[1], leftEye[2], leftEye[3]], 'rgba(244, 236, 255, 0.92)', 2.6);
  gstmxx.drawOpenPath(ctx, [rightEye[0], rightEye[1], rightEye[2], rightEye[3]], 'rgba(244, 236, 255, 0.92)', 2.6);

  const lc = gstmxx.avgPoint(leftEye);
  gstmxx.drawLabel(ctx, 'smokey 2D', lc.x - 24, lc.y - 36);
  ctx.restore();
}

/**
 * Meta' destra: la mesh MediaPipe viene dipinta in UV-space.
 * Questa texture viene poi warpata sui triangoli del volto dal renderer UV.
 */
export function paintUV(ctx) {
  const landmarks3d = gstmxx.lastLandmarks3d;

  ctx.save();
  if (!gstmxx.clipRightHalfUV(ctx, landmarks3d)) {
    ctx.restore();
    return;
  }

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  const g1 = ctx.createRadialGradient(w * 0.36, h * 0.42, w * 0.03, w * 0.36, h * 0.42, w * 0.16);
  g1.addColorStop(0, 'rgba(205, 165, 255, 0.34)');
  g1.addColorStop(1, 'rgba(78, 42, 125, 0.04)');
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.ellipse(w * 0.36, h * 0.42, w * 0.17, h * 0.10, -0.12, 0, Math.PI * 2);
  ctx.fill();

  const g2 = ctx.createRadialGradient(w * 0.65, h * 0.42, w * 0.03, w * 0.65, h * 0.42, w * 0.16);
  g2.addColorStop(0, 'rgba(205, 165, 255, 0.34)');
  g2.addColorStop(1, 'rgba(78, 42, 125, 0.04)');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.ellipse(w * 0.65, h * 0.42, w * 0.17, h * 0.10, 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
