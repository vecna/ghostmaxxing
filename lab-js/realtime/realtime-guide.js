/**
 * @module realtime-guide
 * @description Draws the baseline's normalized face geometry over the video.
 * The overlay is a positioning memory aid, not a mask or a measurement.
 */

const JAW = Array.from({ length: 17 }, (_, index) => index);
const LEFT_EYE = [36, 37, 38, 39, 40, 41];
const RIGHT_EYE = [42, 43, 44, 45, 46, 47];

/** True when Space belongs to the page rather than a focused control. */
export function canUseGuideShortcut(target) {
  if (!(target instanceof Element)) return true;
  if (target.closest('button, input, select, textarea, summary, video, [contenteditable="true"], [role="dialog"]')) {
    return false;
  }
  return true;
}

/**
 * Creates a temporary baseline-guide overlay.
 *
 * @param {object} options Controller wiring.
 * @param {HTMLCanvasElement} options.canvasEl Overlay canvas.
 * @param {HTMLVideoElement} options.videoEl Video whose object-fit is mirrored.
 * @param {HTMLElement} options.stageEl Canvas positioning container.
 * @returns {object} Guide controller.
 */
export function createBaselineGuide({ canvasEl, videoEl, stageEl }) {
  const ctx = canvasEl.getContext('2d');
  let guide = null;
  let fadeTimer = null;
  let hideTimer = null;

  function clearTimers() {
    if (fadeTimer) window.clearTimeout(fadeTimer);
    if (hideTimer) window.clearTimeout(hideTimer);
    fadeTimer = null;
    hideTimer = null;
  }

  function pointMapper(width, height) {
    const stageRect = stageEl.getBoundingClientRect();
    const videoRect = videoEl.getBoundingClientRect();
    const sourceW = guide.aspectRatio;
    const sourceH = 1;
    const fit = getComputedStyle(videoEl).objectFit || 'fill';
    const scale = fit === 'cover'
      ? Math.max(videoRect.width / sourceW, videoRect.height / sourceH)
      : Math.min(videoRect.width / sourceW, videoRect.height / sourceH);
    const renderedW = sourceW * scale;
    const renderedH = sourceH * scale;
    const offsetX = videoRect.left - stageRect.left + (videoRect.width - renderedW) / 2;
    const offsetY = videoRect.top - stageRect.top + (videoRect.height - renderedH) / 2;
    const mirrored = videoEl.classList.contains('source-camera');
    return ({ x, y }) => ({
      x: mirrored ? width - (offsetX + x * sourceW * scale) : offsetX + x * sourceW * scale,
      y: Math.min(height, Math.max(0, offsetY + y * sourceH * scale)),
    });
  }

  function strokePath(points, close = false) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    if (close) ctx.closePath();
    ctx.stroke();
  }

  /** Paints the guide using the current stage geometry. */
  function draw() {
    const rect = stageEl.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvasEl.width = Math.floor(width * dpr);
    canvasEl.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!guide) return;

    const map = pointMapper(width, height);
    const landmarks = guide.landmarks.map(map);
    const box = guide.box;
    const boxTopLeft = map({ x: box.x, y: box.y });
    const boxTopRight = map({ x: box.x + box.width, y: box.y });
    const jaw = JAW.map((index) => landmarks[index]);
    const leftEye = LEFT_EYE.map((index) => landmarks[index]);
    const rightEye = RIGHT_EYE.map((index) => landmarks[index]);
    const nose = landmarks[30];

    ctx.strokeStyle = getComputedStyle(canvasEl).getPropertyValue('--rt-guide').trim() || '#ffe7a8';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    strokePath(jaw);

    // face-api has no scalp landmarks. The upper reference is therefore an
    // explicit detector-box arc, connected to the jaw endpoints.
    const leftJaw = jaw[0];
    const rightJaw = jaw[jaw.length - 1];
    const topY = Math.min(boxTopLeft.y, boxTopRight.y);
    const centerX = (leftJaw.x + rightJaw.x) / 2;
    const radiusX = Math.abs(rightJaw.x - leftJaw.x) / 2;
    const radiusY = Math.max(12, Math.max(leftJaw.y, rightJaw.y) - topY);
    ctx.beginPath();
    ctx.ellipse(centerX, Math.max(leftJaw.y, rightJaw.y), radiusX, radiusY, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    strokePath(leftEye, true);
    strokePath(rightEye, true);
    const eyeA = landmarks[36];
    const eyeB = landmarks[45];
    strokePath([eyeA, eyeB]);
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function hide() {
    clearTimers();
    canvasEl.classList.remove('is-visible', 'is-fading');
  }

  function show() {
    if (!guide) return false;
    clearTimers();
    draw();
    canvasEl.classList.remove('is-fading');
    canvasEl.classList.add('is-visible');
    fadeTimer = window.setTimeout(() => canvasEl.classList.add('is-fading'), 1000);
    hideTimer = window.setTimeout(hide, 1600);
    return true;
  }

  const observer = new ResizeObserver(() => {
    if (canvasEl.classList.contains('is-visible')) draw();
  });
  observer.observe(stageEl);

  return {
    draw,
    show,
    hide,
    setGuide(value) {
      guide = value || null;
      if (!guide) hide();
    },
    hasGuide() {
      return Boolean(guide);
    },
    destroy() {
      clearTimers();
      observer.disconnect();
    },
  };
}
