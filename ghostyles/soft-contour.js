/**
 * ==Ghostyle==
 * @name         Soft Contour (split demo)
 * @version      2.0.0
 * @author       NINA
 * @release_date 2025-01-01
 * @description  Demo split contour: face-api a sinistra, UV-space a destra.
 * ==/Ghostyle==
 */

/**
 * Meta' sinistra in pixel-space: usa i 68 landmark face-api e i helper contour.
 */
export function onDraw(ctx, landmarks) {
  const jaw = landmarks.getJawOutline();
  const nose = landmarks.getNose();

  ctx.save();
  if (!gstmxx.clipLeftHalf(ctx, landmarks)) {
    ctx.restore();
    return;
  }

  gstmxx.drawContourBand(ctx, [jaw[1], jaw[2], jaw[3], jaw[4], jaw[5]], 'contour 2D');
  gstmxx.drawContourBand(ctx, [jaw[15], jaw[14], jaw[13], jaw[12], jaw[11]], 'contour 2D');
  gstmxx.drawContourBand(ctx, [nose[0], nose[1], nose[2]], 'nose 2D');
  gstmxx.drawContourBand(ctx, [nose[4], nose[5], nose[6]], 'nose 2D');

  ctx.restore();
}

/**
 * Meta' destra in UV-space: dipinge bande morbide sulla texture MediaPipe.
 * E' lo stesso intento visivo del contour 2D, ma con pipeline mesh UV.
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

  const shade = (x, y, rx, ry, a) => {
    const g = ctx.createRadialGradient(x, y, rx * 0.2, x, y, rx);
    g.addColorStop(0, `rgba(130, 82, 48, ${a})`);
    g.addColorStop(1, 'rgba(130, 82, 48, 0.02)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  shade(w * 0.30, h * 0.56, w * 0.12, h * 0.10, 0.26);
  shade(w * 0.70, h * 0.56, w * 0.12, h * 0.10, 0.26);
  shade(w * 0.50, h * 0.52, w * 0.08, h * 0.18, 0.22);

  ctx.restore();
}
