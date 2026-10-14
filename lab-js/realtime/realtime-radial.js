/**
 * @module realtime-radial
 * @description
 * A compact distribution of descriptor change. Absolute deltas are ranked,
 * then reduced into 16 RMS bands. The spokes are magnitudes, not stable latent
 * coordinates or facial regions.
 */

/**
 * Sorts absolute descriptor deltas and reduces them to equal-sized RMS bands.
 * Ranking makes the plot legible while deliberately discarding coordinate
 * identity: it compares the distribution of change, not where change lives.
 *
 * @param {Float32Array|number[]} values Descriptor deltas.
 * @param {number} [bandCount=16] Number of ranked bands.
 * @returns {number[]} Ascending RMS magnitudes.
 */
export function rankedDeltaBands(values, bandCount = 16) {
  const ranked = Array.from(values || [], (value) => Number.isFinite(value) ? Math.abs(value) : 0)
    .sort((a, b) => a - b);
  if (!ranked.length || bandCount < 1) return [];
  return Array.from({ length: Math.min(bandCount, ranked.length) }, (_, index) => {
    const start = Math.floor((index * ranked.length) / bandCount);
    const end = Math.max(start + 1, Math.floor(((index + 1) * ranked.length) / bandCount));
    const band = ranked.slice(start, end);
    return Math.sqrt(band.reduce((sum, value) => sum + value * value, 0) / band.length);
  });
}

/**
 * Converts descriptor deltas to radial points.
 *
 * @param {Float32Array|number[]} values Signed descriptor deltas.
 * @param {object} [options] Geometry and scale.
 * @param {number} [options.centerX=0] Plot centre x.
 * @param {number} [options.centerY=0] Plot centre y.
 * @param {number} [options.radius=1] Maximum radius.
 * @param {number} [options.maxValue=0.15] Delta mapped to the outer ring.
 * @returns {Array<{x: number, y: number, value: number, index: number}>} Points in descriptor order.
 */
export function radialPoints(values, options = {}) {
  const {
    centerX = 0,
    centerY = 0,
    radius = 1,
    maxValue = 0.15,
  } = options;
  const count = values?.length || 0;
  if (!count) return [];

  return Array.from(values, (raw, index) => {
    const value = Number.isFinite(raw) ? Math.abs(raw) : 0;
    const magnitude = Math.min(1, value / maxValue) * radius;
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return {
      x: centerX + Math.cos(angle) * magnitude,
      y: centerY + Math.sin(angle) * magnitude,
      value,
      index,
    };
  });
}

/**
 * Creates the live/snapshot radial descriptor plot.
 *
 * @param {object} options Controller options.
 * @param {HTMLCanvasElement} options.canvasEl Plot canvas.
 * @param {number} [options.maxDelta=0.15] Delta mapped to the outer ring.
 * @returns {object} Plot controller.
 */
export function createRadialGraph({ canvasEl, maxDelta = 0.15 }) {
  const ctx = canvasEl.getContext('2d');
  let live = null;
  let measured = null;

  function css(name, fallback) {
    const value = getComputedStyle(canvasEl).getPropertyValue(name).trim();
    return value || fallback;
  }

  function path(points) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
  }

  /** Repaints the plot from the current live and measured deltas. */
  function draw() {
    const rect = canvasEl.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (canvasEl.width !== Math.floor(width * dpr) || canvasEl.height !== Math.floor(height * dpr)) {
      canvasEl.width = Math.floor(width * dpr);
      canvasEl.height = Math.floor(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(4, Math.min(width, height) / 2 - 10);
    const grid = css('--rt-grid', 'rgba(255,231,168,0.12)');

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * fraction, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let index = 0; index < 16; index += 1) {
      const angle = -Math.PI / 2 + (index / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      ctx.stroke();
    }

    if (measured?.length) {
      const points = radialPoints(measured, { centerX, centerY, radius, maxValue: maxDelta });
      path(points);
      ctx.fillStyle = css('--rt-radial-measured-fill', 'rgba(242,106,27,0.25)');
      ctx.strokeStyle = css('--rt-radial-measured', '#f26a1b');
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }

    if (live?.length) {
      const points = radialPoints(live, { centerX, centerY, radius, maxValue: maxDelta });
      path(points);
      ctx.strokeStyle = css('--rt-radial-live', '#ffe7a8');
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const observer = new ResizeObserver(draw);
  observer.observe(canvasEl);

  return {
    draw,
    setLive(values) {
      live = values ? rankedDeltaBands(values) : null;
      draw();
    },
    setMeasured(values) {
      measured = values ? rankedDeltaBands(values) : null;
      draw();
    },
    reset() {
      live = null;
      measured = null;
      draw();
    },
    destroy() {
      observer.disconnect();
    },
  };
}
