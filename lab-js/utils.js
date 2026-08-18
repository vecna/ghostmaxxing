/**
 * @module utils
 * @description
 * Pure helpers shared across the codebase and exposed to plugin authors via
 * `window.gstmxx`. Three layers, top to bottom:
 *
 *   1. Math primitives — `distance`, `avgPoint`, `lerp`, `scaleFrom`, `point`.
 *      Trivial geometric building blocks. Pure functions, no DOM.
 *   2. Canvas drawing primitives — `drawClosedPath`, `drawOpenPath`,
 *      `drawLabel`, `roundRect`. Wrappers around `CanvasRenderingContext2D`
 *      that codify the project's visual language (label background, dashed
 *      lines, mirrored-text handling).
 *   3. Composed makeup helpers — `expandEyePolygon`, `drawEyeWing`,
 *      `drawCheekSweep`, `drawContourBand`. Built from the lower layers,
 *      these are what most 2D ghostyle plugins reach for.
 *
 * Plus the in-app logging helpers (`formatTime`, `setLog`, `updateLogDisplay`)
 * which write to `state.logsArchive` and rerender the log box.
 *
 * Why this module exists as the public plugin API surface: plugin authors
 * should never need to know about face-api or MediaPipe internals — they
 * should just `Ghostati.drawClosedPath(ctx, points, …)` and have it look
 * consistent with everything else. Keeping the helpers here (and pure) makes
 * them unit-testable without a browser.
 */
import { state } from './state.js';

/**
 * Euclidean distance between two equal-length numeric arrays. Returns
 * `Infinity` for malformed input rather than throwing, because the callers
 * are inference hot paths that prefer a degraded comparison over an
 * exception (an `Infinity` distance simply never wins a min/closest query).
 *
 * @param {number[]} a  First vector.
 * @param {number[]} b  Second vector, same length as `a`.
 * @returns {number} Euclidean distance, or `Infinity` if inputs are invalid.
 * @see lab-js/engine.js – `seekFaceInDb()` and `computeCompositeMetrics()`
 *   use this against 128-D face-api descriptors.
 */
export function distance(a, b) {
   if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
   let sum = 0;
   for (let i = 0; i < a.length; i += 1) {
      const d = a[i] - b[i];
      sum += d * d;
   }
   return Math.sqrt(sum);
}

/**
 * Centroid of an array of 2D points. Plugin authors use it to anchor labels
 * or shapes at the visual centre of a feature (eye, mouth) without having to
 * reduce manually.
 *
 * @param {Array<{x:number, y:number}>} points  Non-empty array of points.
 * @returns {{x:number, y:number}} The averaged point.
 * @see expandEyePolygon – uses this to locate the eye centre.
 * @see ghostyles/smokey-eyes.js, ghostyles/lip-tint.js – representative
 *   plugin consumers via `Ghostati.avgPoint`.
 */
export function avgPoint(points) {
   const total = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
   return { x: total.x / points.length, y: total.y / points.length };
}

/**
 * Linear interpolation between two 2D points. `t = 0` returns `a`, `t = 1`
 * returns `b`; values outside `[0, 1]` extrapolate, which is sometimes
 * useful for "slightly past the endpoint" effects (the `splash.js` plugin
 * does this with `t = 1.2` and `t = -0.6` for off-edge anchors).
 *
 * @param {{x:number, y:number}} a  Start point.
 * @param {{x:number, y:number}} b  End point.
 * @param {number} t  Interpolation factor; clamped only by the caller.
 * @returns {{x:number, y:number}} The interpolated point.
 * @see expandEyePolygon, drawEyeWing, drawCheekSweep – internal uses.
 * @see ghostyles/splash.js – extensive use via `Ghostati.lerp` for anchors.
 */
export function lerp(a, b, t) {
   return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Scale a point outward from a centre by a uniform factor. `scale > 1`
 * pushes the point away from the centre; `scale < 1` pulls it in. Used to
 * grow or shrink a feature polygon while keeping its centroid fixed.
 *
 * @param {{x:number, y:number}} center  Pivot of the scaling.
 * @param {{x:number, y:number}} point   Point to scale.
 * @param {number} scale                 Multiplicative factor.
 * @returns {{x:number, y:number}} The scaled point.
 * @see expandEyePolygon – the canonical caller, used to enlarge eye outlines.
 */
export function scaleFrom(center, point, scale) {
   return { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale };
}

/**
 * Convenience constructor for a `{x, y}` point. Exists so plugin code reads
 * fluently (`Ghostati.point(120, 40)` rather than `{x: 120, y: 40}`) when
 * inline-building anchor positions or pushing extra points onto a path.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{x:number, y:number}}
 * @see ghostyles/smokey-eyes.js, ghostyles/stage-mask.js – use this when
 *   appending custom anchors to landmark-derived polygons.
 */
export function point(x, y) {
   return { x, y };
}

/**
 * Stroke and/or fill a closed polygon defined by an array of points. Either
 * `fillStyle` or `strokeStyle` can be `null` to skip that operation, so the
 * same function works for filled shapes, outlines only, or both. No-ops
 * silently on an empty `points` array.
 *
 * @param {CanvasRenderingContext2D} ctx  Target canvas context.
 * @param {Array<{x:number, y:number}>} points  Polygon vertices.
 * @param {string|null} [fillStyle=null]   Fill color, or `null` to skip.
 * @param {string|null} [strokeStyle=null] Stroke color, or `null` to skip.
 * @param {number} [lineWidth=2]           Stroke width (ignored if no stroke).
 * @see drawEyeWing – fills and strokes the eye shape via this.
 * @see drawCheekSweep – fills the cheek polygon.
 * @see drawContourBand – uses `drawOpenPath` instead (this is for closed
 *   shapes only).
 */
export function drawClosedPath(ctx, points, fillStyle = null, strokeStyle = null, lineWidth = 2) {
   if (!points.length) return;
   ctx.beginPath();
   ctx.moveTo(points[0].x, points[0].y);
   for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
   ctx.closePath();
   if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
   }
   if (strokeStyle) {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
   }
}

/**
 * Stroke an open polyline through the given points. Supports an optional
 * dashed style for the "graphical liner" aesthetic some plugins use. Wraps
 * `ctx.save`/`ctx.restore` so the dash pattern doesn't leak into subsequent
 * drawing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number}>} points
 * @param {string} strokeStyle    Stroke colour.
 * @param {number} [lineWidth=2]
 * @param {boolean} [dashed=false]  When `true`, applies a `[10, 8]` dash pattern.
 * @see drawEyeWing – uses this for the eyeline strokes.
 * @see drawContourBand – uses this twice (dashed + solid) for layered bands.
 */
export function drawOpenPath(ctx, points, strokeStyle, lineWidth = 2, dashed = false) {
   if (!points.length) return;
   ctx.save();
   ctx.beginPath();
   ctx.moveTo(points[0].x, points[0].y);
   for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
   ctx.lineWidth = lineWidth;
   ctx.strokeStyle = strokeStyle;
   if (dashed) ctx.setLineDash([10, 8]);
   ctx.stroke();
   ctx.restore();
}

/**
 * Draw a small labelled box at `(x, y)`. The label background is a rounded
 * dark rectangle with a thin outline; the text is rendered in the
 * project-standard sans-serif. When the canvas is mirrored
 * (`state.isMirrored`) the label is un-mirrored locally so the text remains
 * readable left-to-right.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text  Label text.
 * @param {number} x     Left anchor (the box grows rightward from here).
 * @param {number} y     Bottom-of-label baseline.
 * @see drawEyeWing, drawCheekSweep, drawContourBand – call this to caption
 *   the corresponding region.
 * @see roundRect – used internally to draw the background pill.
 */
export function drawLabel(ctx, text, x, y) {
   ctx.save();
   ctx.font = '700 14px Inter, system-ui, sans-serif';
   const padX = 10;
   const padY = 7;
   const width = ctx.measureText(text).width + padX * 2;
   const height = 30;

   if (state.isMirrored) {
      ctx.translate(x + width / 2, y - height / 2);
      ctx.scale(-1, 1);
      ctx.translate(-(x + width / 2), -(y - height / 2));
   }

   ctx.fillStyle = 'rgba(15, 17, 21, 0.78)';
   ctx.strokeStyle = 'rgba(255,255,255,0.10)';
   ctx.lineWidth = 1;
   roundRect(ctx, x, y - height, width, height, 12);
   ctx.fill();
   ctx.stroke();
   ctx.fillStyle = 'rgba(238, 242, 255, 0.96)';
   ctx.fillText(text, x + padX, y - 10);
   ctx.restore();
}

/**
 * Append a rounded-rectangle subpath to the current canvas path. Caller is
 * responsible for `ctx.fill()` / `ctx.stroke()` afterwards. The corners are
 * drawn with `arcTo` so the radius is honoured exactly even on rectangles
 * whose dimensions approach `2 * r`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x  Top-left x.
 * @param {number} y  Top-left y.
 * @param {number} w  Width.
 * @param {number} h  Height.
 * @param {number} r  Corner radius.
 * @see drawLabel – the only caller in-tree; uses this for the label pill.
 */
export function roundRect(ctx, x, y, w, h, r) {
   ctx.beginPath();
   ctx.moveTo(x + r, y);
   ctx.arcTo(x + w, y, x + w, y + h, r);
   ctx.arcTo(x + w, y + h, x, y + h, r);
   ctx.arcTo(x, y + h, x, y, r);
   ctx.arcTo(x, y, x + w, y, r);
   ctx.closePath();
}

/**
 * Build an enlarged eye-shape polygon by combining the upper eyebrow points
 * (lifted toward the eye via `lerp`) with the lower eye points (radially
 * expanded via `scaleFrom`). The output is an ordered ring of points
 * suitable for `drawClosedPath`.
 *
 * The two tuning factors are intentionally exposed so plugins can dial the
 * dramatic level: `scale` controls how far the lower lid bulges out,
 * `eyebrowLift` controls how close the top of the shape sits to the eye
 * (`0` = right on the brow, `1` = right at the eye).
 *
 * @param {Array<{x:number, y:number}>} eye      Six face-api eye landmarks.
 * @param {Array<{x:number, y:number}>} eyebrow  Five face-api eyebrow landmarks.
 * @param {number} [scale=1.22]        Outward scaling factor of the lower lid.
 * @param {number} [eyebrowLift=0.72]  Lerp factor between eye and eyebrow.
 * @returns {Array<{x:number, y:number}>} Ring of points defining the eye region.
 * @see drawEyeWing – the primary caller.
 * @see avgPoint, scaleFrom, lerp – primitives composed here.
 */
export function expandEyePolygon(eye, eyebrow, scale = 1.22, eyebrowLift = 0.72) {
   const center = avgPoint(eye);
   const topBrow = eyebrow.map((b, idx) => {
      const eyeRef = eye[Math.min(idx + 1, eye.length - 1)] || eye[eye.length - 1];
      return lerp(eyeRef, b, eyebrowLift);
   });
   const expandedEye = eye.map(pt => scaleFrom(center, pt, scale));
   return [...topBrow, expandedEye[3], expandedEye[4], expandedEye[5], expandedEye[0]];
}

/**
 * Draw a stylised winged-eye shape with a tail extending past the outer
 * corner, the underlying enlarged-eye polygon, and a label. Side-aware: the
 * `tone.side` argument (`'left'` or `'right'`) flips which eye corner becomes
 * the tail anchor and on which side the label sits.
 *
 * `tone` collects every styling decision so the function stays generic across
 * different plugins: scale of the polygon, eyebrow lift, fill / stroke / line
 * colours, the tail offsets, and the side. Plugins typically pass a literal
 * object inline; see `graphic-liner.js` and `splash.js` for usage examples.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number}>} eye      Six face-api eye landmarks.
 * @param {Array<{x:number, y:number}>} eyebrow  Five face-api eyebrow landmarks.
 * @param {string} label                    Label drawn near the tail.
 * @param {{
 *   scale:number, brow:number,
 *   fill:string, stroke:string, line:string,
 *   side:('left'|'right'),
 *   tailX:number, tailY:number
 * }} tone  Styling and geometry knobs.
 * @see expandEyePolygon – called first to compute the base shape.
 * @see drawClosedPath, drawOpenPath, drawLabel – the rendering primitives.
 */
export function drawEyeWing(ctx, eye, eyebrow, label, tone) {
   const eyeShape = expandEyePolygon(eye, eyebrow, tone.scale, tone.brow);
   drawClosedPath(ctx, eyeShape, tone.fill, tone.stroke, 2.2);
   const outerCorner = tone.side === 'left'
      ? eye.reduce((best, p) => (p.x < best.x ? p : best), eye[0])
      : eye.reduce((best, p) => (p.x > best.x ? p : best), eye[0]);
   const tailTop = point(outerCorner.x + tone.tailX, outerCorner.y - tone.tailY);
   const tailLow = point(outerCorner.x + tone.tailX * 0.7, outerCorner.y + tone.tailY * 0.12);
   drawClosedPath(ctx, [outerCorner, tailTop, tailLow], tone.fill, tone.stroke, 2.2);
   const sorted = [...eye].sort((a, b) => a.x - b.x);
   const linePts = tone.side === 'left' ? [sorted[2], sorted[1], sorted[0], tailTop] : [sorted[sorted.length - 3], sorted[sorted.length - 2], sorted[sorted.length - 1], tailTop];
   drawOpenPath(ctx, linePts, tone.line, 3.2);
   drawLabel(ctx, label, tailTop.x + (tone.side === 'left' ? -52 : 10), tailTop.y - 10);
}

/**
 * Draw a cheek-sweep shape: a six-vertex polygon traced from an upper anchor
 * down to the jawline and back through the mouth corner. Internally
 * interpolates intermediate vertices with `lerp` so the curve feels organic
 * rather than landmark-blocky.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number, y:number}} anchor       Upper anchor (typically the
 *                                            outer eye corner).
 * @param {{x:number, y:number}} noseSide     Side-of-nose anchor.
 * @param {{x:number, y:number}} mouthCorner  Outer mouth corner.
 * @param {{x:number, y:number}} jawPoint     Lower jaw anchor.
 * @param {string} label
 * @param {string} fill                       Fill colour.
 * @param {string} stroke                     Stroke colour.
 * @see drawClosedPath – used to render the polygon.
 * @see drawLabel – captions the swept region.
 * @see lerp – used to compute intermediate vertices.
 */
export function drawCheekSweep(ctx, anchor, noseSide, mouthCorner, jawPoint, label, fill, stroke) {
   const upper = lerp(anchor, noseSide, 0.42);
   const lower = lerp(mouthCorner, jawPoint, 0.36);
   const side = lerp(anchor, jawPoint, 0.54);
   const cheek = [
      upper,
      lerp(anchor, side, 0.45),
      side,
      lower,
      lerp(lower, mouthCorner, 0.55),
      lerp(mouthCorner, noseSide, 0.42)
   ];
   drawClosedPath(ctx, cheek, fill, stroke, 1.8);
   drawLabel(ctx, label, side.x - 20, side.y - 12);
}

/**
 * Draw a "contour band" along an arbitrary polyline: two stacked
 * `drawOpenPath` strokes, one dashed-warm and one wider translucent-dark,
 * with a label anchored at the midpoint. The double-stroke gives a
 * makeup-contour aesthetic on top of an open landmark sequence
 * (jawline, nose ridge).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number}>} pts  Polyline points (e.g. a jawline slice).
 * @param {string} label
 * @see drawOpenPath – called twice for the layered stroke effect.
 * @see drawLabel – places the caption at the midpoint of the band.
 */
export function drawContourBand(ctx, pts, label) {
   drawOpenPath(ctx, pts, 'rgba(193, 154, 107, 0.95)', 7, true);
   drawOpenPath(ctx, pts, 'rgba(90, 54, 33, 0.22)', 16);
   const mid = pts[Math.floor(pts.length / 2)];
   drawLabel(ctx, label, mid.x + 10, mid.y - 6);
}

function asFaceApiPoints(landmarks) {
   if (!landmarks) return [];
   if (Array.isArray(landmarks)) return landmarks.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
   if (typeof landmarks.positions !== 'undefined' && Array.isArray(landmarks.positions)) {
      return landmarks.positions.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
   }
   if (typeof landmarks.getPositions === 'function') {
      const pts = landmarks.getPositions();
      return Array.isArray(pts) ? pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
   }
   return [];
}

function asMediapipePoints(landmarks3d) {
   if (!Array.isArray(landmarks3d)) return [];
   return landmarks3d.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
}

/**
 * Clip the current canvas context to the left half of a face-api landmark cloud.
 *
 * The split axis is the vertical line that passes through the landmarks centroid.
 * This helper exists so a plugin can render a side-by-side comparison where one
 * half of the face shows a 2D pixel-space strategy and the other half is left
 * untouched (or rendered by a different callback).
 *
 * IMPORTANT: call `ctx.save()` before using this helper and `ctx.restore()`
 * afterwards. The function only applies the clip path.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context.
 * @param {object|Array<{x:number,y:number}>} landmarks - face-api landmarks object or array of points.
 * @returns {boolean} `true` when clip has been applied, `false` when landmarks are missing.
 * @see ghostyles/smokey-eyes.js
 * @see ghostyles/soft-contour.js
 */
export function clipLeftHalf(ctx, landmarks) {
   const pts = asFaceApiPoints(landmarks);
   if (!pts.length) return false;

   const c = avgPoint(pts);
   const margin = Math.max(ctx.canvas.width, ctx.canvas.height) * 2;
   ctx.beginPath();
   ctx.rect(-margin, -margin, c.x + margin, ctx.canvas.height + margin * 2);
   ctx.clip();
   return true;
}

/**
 * Clip the current canvas context to the right half of a face-api landmark cloud.
 *
 * The split axis is the vertical line through the landmarks centroid. Use this
 * together with `clipLeftHalf` when a plugin needs to compare two rendering
 * strategies on the same face without visual overlap.
 *
 * IMPORTANT: call `ctx.save()` before using this helper and `ctx.restore()`
 * afterwards. The function only applies the clip path.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context.
 * @param {object|Array<{x:number,y:number}>} landmarks - face-api landmarks object or array of points.
 * @returns {boolean} `true` when clip has been applied, `false` when landmarks are missing.
 * @see ghostyles/smokey-eyes.js
 * @see ghostyles/soft-contour.js
 */
export function clipRightHalf(ctx, landmarks) {
   const pts = asFaceApiPoints(landmarks);
   if (!pts.length) return false;

   const c = avgPoint(pts);
   const margin = Math.max(ctx.canvas.width, ctx.canvas.height) * 2;
   ctx.beginPath();
   ctx.rect(c.x, -margin, ctx.canvas.width - c.x + margin * 2, ctx.canvas.height + margin * 2);
   ctx.clip();
   return true;
}

/**
 * Clip a UV canvas to the left half of the MediaPipe landmark cloud.
 *
 * The landmarks are normalized in `[0,1]`, so the centroid x is converted to
 * pixel coordinates of the UV canvas before clipping. This makes it possible to
 * show UV-space rendering only on one side while another strategy occupies the
 * opposite side.
 *
 * IMPORTANT: call `ctx.save()` before using this helper and `ctx.restore()`
 * afterwards. The function only applies the clip path.
 *
 * @param {CanvasRenderingContext2D} ctx - UV texture rendering context.
 * @param {Array<{x:number,y:number,z:?number}>} landmarks3d - MediaPipe face landmarks.
 * @returns {boolean} `true` when clip has been applied, `false` when landmarks are missing.
 * @see ghostyles/smokey-eyes.js
 * @see ghostyles/soft-contour.js
 */
export function clipLeftHalfUV(ctx, landmarks3d) {
   const pts = asMediapipePoints(landmarks3d);
   if (!pts.length) return false;

   const c = avgPoint(pts);
   const axisX = c.x * ctx.canvas.width;
   const margin = Math.max(ctx.canvas.width, ctx.canvas.height) * 2;
   ctx.beginPath();
   ctx.rect(-margin, -margin, axisX + margin, ctx.canvas.height + margin * 2);
   ctx.clip();
   return true;
}

/**
 * Clip a UV canvas to the right half of the MediaPipe landmark cloud.
 *
 * This is the UV-space counterpart of `clipRightHalf`. It supports split-view
 * plugins where one side is painted in pixel-space and the other side in
 * UV-space, keeping the didactic comparison readable.
 *
 * IMPORTANT: call `ctx.save()` before using this helper and `ctx.restore()`
 * afterwards. The function only applies the clip path.
 *
 * @param {CanvasRenderingContext2D} ctx - UV texture rendering context.
 * @param {Array<{x:number,y:number,z:?number}>} landmarks3d - MediaPipe face landmarks.
 * @returns {boolean} `true` when clip has been applied, `false` when landmarks are missing.
 * @see ghostyles/smokey-eyes.js
 * @see ghostyles/soft-contour.js
 */
export function clipRightHalfUV(ctx, landmarks3d) {
   const pts = asMediapipePoints(landmarks3d);
   if (!pts.length) return false;

   const c = avgPoint(pts);
   const axisX = c.x * ctx.canvas.width;
   const margin = Math.max(ctx.canvas.width, ctx.canvas.height) * 2;
   ctx.beginPath();
   ctx.rect(axisX, -margin, ctx.canvas.width - axisX + margin * 2, ctx.canvas.height + margin * 2);
   ctx.clip();
   return true;
}

/**
 * Current wall-clock time as a `HH:MM:SS` string. Used exclusively for log
 * timestamping so the workshop participants can correlate UI events with
 * what they did.
 *
 * @returns {string}
 * @see setLog – prefixes every log line with `[formatTime()]`.
 */
export function formatTime() {
   const now = new Date();
   return now.toTimeString().split(' ')[0]; // Returns HH:MM:SS
}

/**
 * Convert a date-like value into a compact Italian relative-time label.
 * Used by plugin buttons to show freshness metadata ("aggiornato X fa").
 *
 * @param {Date|string|number|null|undefined} dateLike
 * @returns {string} Relative time label (e.g. "ora", "17 minuti fa",
 *   "2 mesi fa") or "n/d" when input is invalid.
 */
export function formatRelativeTime(dateLike) {
   if (!dateLike) return 'n/d';

   const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
   if (Number.isNaN(date.getTime())) return 'n/d';

   const diffMs = Date.now() - date.getTime();
   const inFuture = diffMs < 0;
   const absMs = Math.abs(diffMs);

   const minute = 60 * 1000;
   const hour = 60 * minute;
   const day = 24 * hour;
   const month = 30 * day;
   const year = 365 * day;

   if (absMs < minute) return 'ora';

   const suffix = inFuture ? 'tra' : 'fa';
   const asLabel = (value, singular, plural) => {
      const unit = value === 1 ? singular : plural;
      return inFuture ? `${suffix} ${value} ${unit}` : `${value} ${unit} ${suffix}`;
   };

   if (absMs < hour) {
      const value = Math.floor(absMs / minute);
      return asLabel(value, 'minuto', 'minuti');
   }

   if (absMs < day) {
      const value = Math.floor(absMs / hour);
      return asLabel(value, 'ora', 'ore');
   }

   if (absMs < month) {
      const value = Math.floor(absMs / day);
      return asLabel(value, 'giorno', 'giorni');
   }

   if (absMs < year) {
      const value = Math.floor(absMs / month);
      return asLabel(value, 'mese', 'mesi');
   }

   const value = Math.floor(absMs / year);
   return asLabel(value, 'anno', 'anni');
 }

/**
 * Re-render the on-screen log box from `state.logsArchive`. Has two modes:
 * expanded (full archive, oldest at top, autoscrolled to bottom — for
 * post-mortem) and collapsed (latest four lines, newest at top — for live
 * peripheral attention). Mode is driven by `state.isLogExpanded`, toggled
 * by clicking the log box.
 *
 * @see setLog – calls this after pushing a new entry.
 * @see lab-js/main.js – wires the click handler that toggles
 *   `state.isLogExpanded`.
 */
export function updateLogDisplay() {
   const logBox = document.getElementById('logBox');
   if (!logBox) return;
   logBox.innerHTML = '';

   if (state.isLogExpanded) {
      logBox.classList.add('expanded');
      const startIdx = Math.max(0, state.logsArchive.length - 100);
      for (let i = startIdx; i < state.logsArchive.length; i++) {
         const clone = state.logsArchive[i].cloneNode(true);
         logBox.appendChild(clone);
      }
      logBox.scrollTop = logBox.scrollHeight;
   } else {
      logBox.classList.remove('expanded');
      let renderedCount = 0;
      for (let i = state.logsArchive.length - 1; i >= state.visibleLogStartIndex && renderedCount < 4; i--) {
         const clone = state.logsArchive[i].cloneNode(true);
         logBox.insertBefore(clone, logBox.firstChild);
         renderedCount++;
      }
   }
}

/**
 * Append a log line to `state.logsArchive` and refresh the on-screen log.
 * Each line is timestamped via `formatTime()` and may carry an optional
 * source-plugin tag (rendered in accent colour) so a workshop participant
 * can tell at a glance which plugin emitted the message. The archive is
 * capped at 100 entries (FIFO drop); `visibleLogStartIndex` shifts in step
 * so the "clear visible logs" feature never accidentally reveals stale data.
 *
 * @param {string} message               Text of the log entry.
 * @param {string|null} [sourcePlugin=null]  Optional plugin tag.
 * @see formatTime – produces the timestamp prefix.
 * @see updateLogDisplay – refreshes the DOM after the push.
 */
export function setLog(message, sourcePlugin = null) {
   const line = document.createElement('div');
   line.className = 'log-line';

   const timeSpan = document.createElement('span');
   timeSpan.style.color = 'var(--muted)';
   timeSpan.style.marginRight = '8px';
   timeSpan.textContent = `[${formatTime()}]`;
   line.appendChild(timeSpan);

   if (sourcePlugin) {
      const span = document.createElement('span');
      span.style.color = 'var(--accent-2)';
      span.style.fontWeight = '800';
      span.style.marginRight = '8px';
      span.textContent = `[${sourcePlugin.toUpperCase()}]`;
      line.appendChild(span);
   }
   const textSpan = document.createElement('span');
   textSpan.textContent = message;
   line.appendChild(textSpan);

   state.logsArchive.push(line);
   if (state.logsArchive.length > 100) {
      state.logsArchive.shift();
      if (state.visibleLogStartIndex > 0) state.visibleLogStartIndex--;
   }

   updateLogDisplay();
}

/**
 * Converts thrown plugin failures into the compact label used by loader logs.
 * In this project it keeps broken `paintUV` errors readable while preserving
 * non-Error throws from third-party ghostyles.
 *
 * @param {*} err - Value caught while rendering a 3D ghostyle.
 * @returns {string} Error name and message, or a stringified thrown value.
 * @see deactivateBroken3dPlugin - Formats the `paintUV` failure logged for a disabled plugin.
 */
export function asErrorLabel(err) {
   if (err instanceof Error) return `${err.name}: ${err.message}`;
   return String(err);
}

/**
 * Keeps the hidden 3D plugin canvas matched to the live overlay dimensions so
 * UV paint is composited into the same coordinate space as the camera frame.
 *
 * @param {HTMLCanvasElement} canvas  The hidden 3D plugin canvas.
 * @param {HTMLCanvasElement} overlayEl  The main overlay canvas.
 * @returns {void}
 * @see initPlugins3dLoader - Called on each `landmarks3d` frame before drawing the active ghostyle.
 */
export function syncSize(canvas, overlayEl) {
   if (canvas.width !== overlayEl.width || canvas.height !== overlayEl.height) {
      canvas.width = overlayEl.width;
      canvas.height = overlayEl.height;
   }
}

/**
 * Mirrors the 3D plugin canvas with the main overlay transform, preserving the
 * webcam mirror mode when UV-painted effects are displayed or composited.
 *
 * @param {HTMLCanvasElement} canvas  The hidden 3D plugin canvas.
 * @param {HTMLCanvasElement} overlayEl  The main overlay canvas.
 * @returns {void}
 * @see initPlugins3dLoader - Called on each `landmarks3d` frame before drawing the active ghostyle.
 */
export function syncMirror(canvas, overlayEl) {
   const transform = overlayEl.style.transform;
   if (canvas.style.transform !== transform) canvas.style.transform = transform;
}