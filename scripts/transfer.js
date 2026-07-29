/**
 * @module transfer
 * @description
 * # Ghostyle Transfer Lab
 *
 * ## Project Objective
 *
 * The goal of this browser-only experiment is to let a user capture a painted
 * visual style from one face and preview it on another face without sending
 * images to a server. Instead of treating the transfer as a black box, the page
 * exposes the practical stages of the process: choosing source and target
 * images, marking face regions, extracting a transparent paint matte, previewing
 * that matte, and compositing the result with adjustable blend controls.
 *
 * ## Technical Stack
 *
 * The module is written in JavaScript and uses the DOM for the control surface,
 * the Canvas 2D API for pixel extraction, matte generation, preview drawing,
 * affine triangle warping, and final compositing, and `@vladmandic/face-api`
 * for optional 68-point landmark detection. All image processing happens in the
 * browser runtime.
 *
 * ## Interface Model
 *
 * The UI is organized around three upload slots: an optional before image, a
 * required painted after image, and a required target image. Each slot renders a
 * fitted preview canvas where the user draws a face box in image coordinates.
 * A side matte preview shows the extracted paint layer, while the result panel
 * displays the final target composite and enables download once a transfer has
 * completed.
 *
 * ## Functional Workflow
 *
 * The transfer starts in a setup state until the after and target slots both
 * have images and face boxes. Running the transfer normalizes the after face
 * crop into a canonical square, subtracts either the matching before crop or a
 * sampled reference color, feathers the resulting alpha plane, and then places
 * the matte onto the target. When landmarks are available and mesh mode is
 * enabled, corresponding face points are triangulated and the matte is warped
 * triangle by triangle; otherwise the system falls back to direct box placement
 * with a status note that explains which mode was used.
 */
import { applyI18n, initI18n, setupLocaleSelect, t } from './i18n.js';

const CANON = 512;
const RESULT_MAX = 900;
const MODEL_ROOT = new URL('./vendor/', import.meta.url).href;

/**
 * Two-dimensional point in image or canvas coordinates.
 *
 * @typedef {Object} Point
 * @property {number} x - Horizontal coordinate.
 * @property {number} y - Vertical coordinate.
 *
 * Rectangular face selection in original image coordinates.
 *
 * @typedef {Object} Box
 * @property {number} x - Left edge.
 * @property {number} y - Top edge.
 * @property {number} w - Width.
 * @property {number} h - Height.
 *
 * State tracked for one upload slot and its preview canvas.
 *
 * @typedef {Object} TransferSlot
 * @property {?HTMLImageElement} img - Loaded source image, or null before load.
 * @property {?Box} box - User-selected face box, or null until selected.
 * @property {number} scale - Ratio from preview pixels to original image pixels.
 * @property {number} dispW - Preview image width in CSS pixels.
 * @property {number} dispH - Preview image height in CSS pixels.
 *
 * Three-channel average color stored as red, green, and blue values.
 *
 * @typedef {Array.<number>} RgbTuple
 */

/** @type {Record<'before'|'after'|'target', TransferSlot>} */
const slots = {
   before: { img: null, box: null, scale: 1, dispW: 0, dispH: 0 },
   after: { img: null, box: null, scale: 1, dispW: 0, dispH: 0 },
   target: { img: null, box: null, scale: 1, dispW: 0, dispH: 0 }
};

let faceapiReady = false;
let lastResultCanvas = null;
let engineState = { key: 'transfer_engine_loading', ready: false };
let messageState = { key: 'transfer_msg_load_after_target', params: {} };
let modeState = { key: 'transfer_mode_not_run', params: {}, placed: false };

/**
 * Resolve a required DOM element by id.
 *
 * @param {string} id - DOM id.
 * @returns {HTMLElement} Matching element.
 * @throws {Error} When the expected element is missing from the page.
 */
function byId(id) {
   const el = document.getElementById(id);
   if (!el) throw new Error(`Missing transfer element: ${id}`);
   return el;
}

/**
 * Resolve a canvas rendering context with a clear failure mode.
 *
 * @param {HTMLCanvasElement} canvas - Canvas to draw into.
 * @returns {CanvasRenderingContext2D} Two-dimensional context.
 * @throws {Error} When the browser cannot allocate a 2D context.
 */
function ctx2d(canvas) {
   const ctx = canvas.getContext('2d');
   if (!ctx) throw new Error(t('canvas_2d_context_error'));
   return ctx;
}

/**
 * Clamp a numeric value to a closed interval.
 *
 * @param {number} value - Candidate value.
 * @param {number} min - Inclusive lower bound.
 * @param {number} max - Inclusive upper bound.
 * @returns {number} Clamped value.
 */
function clamp(value, min, max) {
   return value < min ? min : (value > max ? max : value);
}

/**
 * Change the currently displayed status message.
 *
 * @param {string} key - Translation key.
 * @param {Record<string, string|number>} [params] - Optional interpolation values.
 * @returns {void}
 */
function setMessage(key, params = {}) {
   messageState = { key, params };
   byId('msg').textContent = t(key, params);
}

/**
 * Change the engine availability badge.
 *
 * @param {string} key - Translation key for the badge text.
 * @param {boolean} ready - Whether to render the badge as ready.
 * @returns {void}
 */
function setEngineState(key, ready) {
   engineState = { key, ready };
   byId('engineText').textContent = t(key);
   byId('engineBadge').classList.toggle('is-ready', ready);
}

/**
 * Render the placement mode note. Wrapped modes read as
 * "Placed using: {mode}", while setup states are shown directly.
 *
 * @returns {void}
 */
function renderModeNote() {
   const modeText = t(modeState.key, modeState.params);
   byId('modeNote').textContent = modeState.placed
      ? t('transfer_mode_placed', { mode: modeText })
      : modeText;
}

/**
 * Change the placement mode note.
 *
 * @param {string} key - Translation key for the mode.
 * @param {Record<string, string|number>} [params] - Optional interpolation values.
 * @param {boolean} [placed=false] - Whether to prefix with the placement wrapper.
 * @returns {void}
 */
function setModeState(key, params = {}, placed = false) {
   modeState = { key, params, placed };
   renderModeNote();
}

/**
 * Re-render the empty result placeholder.
 *
 * @returns {void}
 */
function renderResultEmpty() {
   const holder = byId('result');
   holder.innerHTML = '';
   const empty = document.createElement('span');
   empty.className = 'tool-result__empty';
   empty.dataset.i18n = 'transfer_result_empty';
   empty.textContent = t('transfer_result_empty');
   holder.appendChild(empty);
}

/**
 * Re-apply locale-dependent runtime text that is not covered by static
 * `data-i18n` attributes.
 *
 * @returns {void}
 */
function refreshLocalizedState() {
   document.title = t('transfer_page_title');
   byId('engineText').textContent = t(engineState.key);
   byId('engineBadge').classList.toggle('is-ready', engineState.ready);
   byId('msg').textContent = t(messageState.key, messageState.params);
   renderModeNote();
   for (const name of Object.keys(slots)) refreshSlotNote(name);
   if (!lastResultCanvas) renderResultEmpty();
}

/**
 * Load the optional landmark models. The transfer remains usable in box mode
 * when the CDN or model download fails.
 *
 * @returns {Promise<void>} Resolves after the best-effort setup.
 */
async function initFaceapi() {
   const api = window.faceapi;
   if (!api) {
      setEngineState('transfer_engine_unavailable', false);
      return;
   }

   try {
      await api.nets.tinyFaceDetector.loadFromUri(MODEL_ROOT);
      await api.nets.faceLandmark68Net.loadFromUri(MODEL_ROOT);
      faceapiReady = true;
      setEngineState('transfer_engine_ready', true);
   } catch (err) {
      setEngineState('transfer_engine_failed', false);
      console.warn('face-api load failed:', err);
   }
}

/**
 * Fit a source image into its square preview stage and bind box drawing to the
 * generated canvas.
 *
 * @param {'before'|'after'|'target'} name - Slot to render.
 * @returns {void}
 */
function fitPreview(name) {
   const slot = slots[name];
   const stage = byId(`stage-${name}`);
   stage.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
   const hint = byId(`hint-${name}`);
   hint.style.display = slot.img ? 'none' : '';
   if (!slot.img) return;

   const rect = stage.getBoundingClientRect();
   const stageWidth = rect.width;
   const stageHeight = rect.height;
   const aspectRatio = slot.img.width / slot.img.height;
   let displayWidth = stageWidth;
   let displayHeight = stageWidth / aspectRatio;

   if (displayHeight > stageHeight) {
      displayHeight = stageHeight;
      displayWidth = stageHeight * aspectRatio;
   }

   slot.dispW = displayWidth;
   slot.dispH = displayHeight;
   slot.scale = slot.img.width / displayWidth;

   const canvas = document.createElement('canvas');
   canvas.width = Math.round(displayWidth);
   canvas.height = Math.round(displayHeight);
   canvas.style.width = `${displayWidth}px`;
   canvas.style.height = `${displayHeight}px`;
   canvas.style.left = `${(stageWidth - displayWidth) / 2}px`;
   canvas.style.top = `${(stageHeight - displayHeight) / 2}px`;
   canvas.style.inset = 'auto';
   stage.appendChild(canvas);
   redrawSlot(name, canvas);
   attachBoxDrawing(name, canvas);
}

/**
 * Draw a slot image and the current crop box into its preview canvas.
 *
 * @param {'before'|'after'|'target'} name - Slot to draw.
 * @param {HTMLCanvasElement} canvas - Preview canvas.
 * @returns {void}
 */
function redrawSlot(name, canvas) {
   const slot = slots[name];
   if (!slot.img) return;

   const ctx = ctx2d(canvas);
   ctx.clearRect(0, 0, canvas.width, canvas.height);
   ctx.drawImage(slot.img, 0, 0, canvas.width, canvas.height);

   if (!slot.box) return;

   const box = slot.box;
   const scale = 1 / slot.scale;
   const x = box.x * scale;
   const y = box.y * scale;
   const width = box.w * scale;
   const height = box.h * scale;
   const tick = 10;

   ctx.lineWidth = 2;
   ctx.strokeStyle = '#f3c747';
   ctx.strokeRect(x, y, width, height);
   ctx.strokeStyle = '#ffe7a8';
   ctx.lineWidth = 3;
   ctx.beginPath();
   ctx.moveTo(x, y + tick); ctx.lineTo(x, y); ctx.lineTo(x + tick, y);
   ctx.moveTo(x + width - tick, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + tick);
   ctx.moveTo(x, y + height - tick); ctx.lineTo(x, y + height); ctx.lineTo(x + tick, y + height);
   ctx.moveTo(x + width - tick, y + height); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width, y + height - tick);
   ctx.stroke();
}

/**
 * Attach pointer handlers that let the user draw a face box in image
 * coordinates while seeing the box in preview coordinates.
 *
 * @param {'before'|'after'|'target'} name - Slot being edited.
 * @param {HTMLCanvasElement} canvas - Interactive preview canvas.
 * @returns {void}
 */
function attachBoxDrawing(name, canvas) {
   const slot = slots[name];
   let drawing = false;
   let startX = 0;
   let startY = 0;

   const toImagePoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
         x: (event.clientX - rect.left) * slot.scale,
         y: (event.clientY - rect.top) * slot.scale
      };
   };

   canvas.addEventListener('pointerdown', (event) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const point = toImagePoint(event);
      startX = point.x;
      startY = point.y;
      slot.box = { x: startX, y: startY, w: 0, h: 0 };
   });

   canvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const point = toImagePoint(event);
      slot.box = {
         x: Math.min(startX, point.x),
         y: Math.min(startY, point.y),
         w: Math.abs(point.x - startX),
         h: Math.abs(point.y - startY)
      };
      redrawSlot(name, canvas);
   });

   const endDrawing = () => {
      if (!drawing) return;
      drawing = false;
      if (slot.box && (slot.box.w < 8 || slot.box.h < 8)) slot.box = null;
      redrawSlot(name, canvas);
      refreshState();
   };

   canvas.addEventListener('pointerup', endDrawing);
   canvas.addEventListener('pointercancel', endDrawing);
}

/**
 * Update a single slot note from its current image and box state.
 *
 * @param {string} name - Slot name.
 * @returns {void}
 */
function refreshSlotNote(name) {
   const slot = slots[name];
   const note = byId(`note-${name}`);
   if (slot.box) {
      note.textContent = t('transfer_note_box_set');
   } else if (slot.img) {
      note.textContent = t('transfer_note_draw_box');
   } else {
      note.textContent = '';
   }
}

/**
 * Recompute readiness and related user-facing prompts after image or box
 * changes.
 *
 * @returns {void}
 */
function refreshState() {
   for (const name of Object.keys(slots)) refreshSlotNote(name);
   const ready = Boolean(slots.after.img && slots.after.box && slots.target.img && slots.target.box);
   byId('run').disabled = !ready;
   setMessage(ready ? 'transfer_msg_ready' : 'transfer_msg_load_after_target');
}

/**
 * Load an image file selected or dropped by the user.
 *
 * @param {'before'|'after'|'target'} name - Destination slot.
 * @param {File} file - Browser file object.
 * @returns {Promise<HTMLImageElement>} Loaded image element.
 */
function loadFile(name, file) {
   return loadURL(name, URL.createObjectURL(file));
}

/**
 * Load an image URL into a slot. Exposed through `window.GT` for automated
 * checks and demos.
 *
 * @param {'before'|'after'|'target'} name - Destination slot.
 * @param {string} url - Image URL.
 * @returns {Promise<HTMLImageElement>} Loaded image element.
 */
function loadURL(name, url) {
   return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
         slots[name].img = image;
         slots[name].box = null;
         fitPreview(name);
         refreshState();
         resolve(image);
      };
      image.onerror = reject;
      image.src = url;
   });
}

/**
 * Draw a slot crop into the canonical transfer coordinate space.
 *
 * @param {'before'|'after'|'target'} name - Slot to crop.
 * @returns {HTMLCanvasElement} Canonical face-frame canvas.
 */
function boxToCanon(name) {
   const slot = slots[name];
   if (!slot.img || !slot.box) throw new Error(`Slot is missing image or box: ${name}`);

   const canvas = document.createElement('canvas');
   canvas.width = CANON;
   canvas.height = CANON;
   ctx2d(canvas).drawImage(slot.img, slot.box.x, slot.box.y, slot.box.w, slot.box.h, 0, 0, CANON, CANON);
   return canvas;
}

/**
 * Extract the painted pixels as an RGBA matte in canonical face coordinates.
 * With a before image, RGB distance is measured against that before crop. When
 * no before is present, a coarse median color approximation is used instead.
 *
 * @param {number} threshold - RGB distance threshold for paint extraction.
 * @param {number} feather - Blur radius for softening the matte alpha.
 * @returns {HTMLCanvasElement} Canonical paint matte.
 */
function extractMatte(threshold, feather) {
   const afterCanon = boxToCanon('after');
   const afterData = ctx2d(afterCanon).getImageData(0, 0, CANON, CANON);
   const refData = slots.before.img && slots.before.box
      ? ctx2d(boxToCanon('before')).getImageData(0, 0, CANON, CANON)
      : null;
   const median = refData ? null : medianColor(afterData);
   const count = CANON * CANON;
   const output = new ImageData(CANON, CANON);
   const alpha = new Float32Array(count);

   for (let i = 0; i < count; i += 1) {
      const p = i * 4;
      const ar = afterData.data[p];
      const ag = afterData.data[p + 1];
      const ab = afterData.data[p + 2];
      const rr = refData ? refData.data[p] : median[0];
      const rg = refData ? refData.data[p + 1] : median[1];
      const rb = refData ? refData.data[p + 2] : median[2];
      const distance = Math.sqrt((ar - rr) ** 2 + (ag - rg) ** 2 + (ab - rb) ** 2);
      alpha[i] = clamp((distance - threshold) / threshold, 0, 1);
      output.data[p] = ar;
      output.data[p + 1] = ag;
      output.data[p + 2] = ab;
   }

   if (feather > 0) boxBlur(alpha, CANON, CANON, feather);

   for (let i = 0; i < count; i += 1) {
      output.data[i * 4 + 3] = Math.round(alpha[i] * 255);
   }

   const matte = document.createElement('canvas');
   matte.width = CANON;
   matte.height = CANON;
   ctx2d(matte).putImageData(output, 0, 0);
   return matte;
}

/**
 * Approximate the dominant skin/reference color by sparse sampling.
 *
 * @param {ImageData} imageData - Canonical source image data.
 * @returns {RgbTuple} Average RGB tuple.
 */
function medianColor(imageData) {
   let r = 0;
   let g = 0;
   let b = 0;
   let n = 0;
   const data = imageData.data;

   for (let i = 0; i < data.length; i += 4 * 29) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
   }

   return [r / n, g / n, b / n];
}

/**
 * Apply two-pass box blur to a float alpha plane.
 *
 * @param {Float32Array} alpha - Alpha plane, mutated in place.
 * @param {number} width - Plane width.
 * @param {number} height - Plane height.
 * @param {number} radius - Blur radius.
 * @returns {void}
 */
function boxBlur(alpha, width, height, radius) {
   const blurRadius = Math.round(radius);
   const tmp = new Float32Array(alpha.length);

   for (let pass = 0; pass < 2; pass += 1) {
      for (let y = 0; y < height; y += 1) {
         let sum = 0;
         const row = y * width;
         for (let x = -blurRadius; x <= blurRadius; x += 1) sum += alpha[row + clamp(x, 0, width - 1)];
         for (let x = 0; x < width; x += 1) {
            tmp[row + x] = sum / (2 * blurRadius + 1);
            sum += alpha[row + clamp(x + blurRadius + 1, 0, width - 1)] - alpha[row + clamp(x - blurRadius, 0, width - 1)];
         }
      }

      for (let x = 0; x < width; x += 1) {
         let sum = 0;
         for (let y = -blurRadius; y <= blurRadius; y += 1) sum += tmp[clamp(y, 0, height - 1) * width + x];
         for (let y = 0; y < height; y += 1) {
            alpha[y * width + x] = sum / (2 * blurRadius + 1);
            sum += tmp[clamp(y + blurRadius + 1, 0, height - 1) * width + x] - tmp[clamp(y - blurRadius, 0, height - 1) * width + x];
         }
      }
   }
}

/**
 * Detect 68 face landmarks inside a user-provided slot box, mapping the result
 * back into original image coordinates.
 *
 * @param {'after'|'target'} name - Slot to analyze.
 * @returns {Promise<Point[]|null>} Landmark points, or null when detection fails.
 */
async function detectLandmarks(name) {
   const api = window.faceapi;
   if (!faceapiReady || !api) return null;

   const slot = slots[name];
   if (!slot.img || !slot.box) return null;

   const margin = 0.25;
   const cropX = slot.box.x - slot.box.w * margin;
   const cropY = slot.box.y - slot.box.h * margin;
   const cropWidth = slot.box.w * (1 + 2 * margin);
   const cropHeight = slot.box.h * (1 + 2 * margin);
   const crop = document.createElement('canvas');
   crop.width = Math.round(cropWidth);
   crop.height = Math.round(cropHeight);
   ctx2d(crop).drawImage(slot.img, cropX, cropY, cropWidth, cropHeight, 0, 0, crop.width, crop.height);

   const detection = await api
      .detectSingleFace(crop, new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
      .withFaceLandmarks();

   if (!detection) return null;
   return detection.landmarks.positions.map((point) => ({ x: cropX + point.x, y: cropY + point.y }));
}

/**
 * Convert image-coordinate landmarks to canonical face-frame coordinates.
 *
 * @param {Point[]} points - Source landmarks.
 * @param {Box} box - Face box used as canonical frame.
 * @returns {Point[]} Canonical points.
 */
function landmarksToCanon(points, box) {
   return points.map((point) => ({
      x: ((point.x - box.x) / box.w) * CANON,
      y: ((point.y - box.y) / box.h) * CANON
   }));
}

/**
 * Build a Delaunay-like triangulation with Bowyer-Watson. This keeps the mesh
 * dependency-free for a small 68-point landmark set.
 *
 * @param {Point[]} points - Points to triangulate.
 * @returns {number[][]} Triples of point indices.
 */
function triangulate(points) {
   const count = points.length;
   if (count < 3) return [];

   let minX = Infinity;
   let minY = Infinity;
   let maxX = -Infinity;
   let maxY = -Infinity;
   for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
   }

   const dx = maxX - minX || 1;
   const dy = maxY - minY || 1;
   const dmax = Math.max(dx, dy);
   const mx = (minX + maxX) / 2;
   const my = (minY + maxY) / 2;
   const working = points.map((point) => ({ x: point.x, y: point.y }));
   working.push({ x: mx - 20 * dmax, y: my - dmax });
   working.push({ x: mx, y: my + 20 * dmax });
   working.push({ x: mx + 20 * dmax, y: my - dmax });

   const s0 = count;
   const s1 = count + 1;
   const s2 = count + 2;
   let triangles = [[s0, s1, s2]];

   const circumcircle = (a, b, c) => {
      const ax = working[a].x;
      const ay = working[a].y;
      const bx = working[b].x;
      const by = working[b].y;
      const cx = working[c].x;
      const cy = working[c].y;
      const denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(denominator) < 1e-9) return null;

      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / denominator;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / denominator;
      return { x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
   };

   const triangleHasEdge = (triangle, a, b) => (
      [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]
         .some((edge) => (edge[0] === a && edge[1] === b) || (edge[0] === b && edge[1] === a))
   );

   for (let i = 0; i < count; i += 1) {
      const bad = [];
      for (const triangle of triangles) {
         const circle = circumcircle(triangle[0], triangle[1], triangle[2]);
         if (circle && ((working[i].x - circle.x) ** 2 + (working[i].y - circle.y) ** 2) <= circle.r2 * (1 + 1e-9)) {
            bad.push(triangle);
         }
      }

      const edges = [];
      for (const triangle of bad) {
         for (const edge of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
            const shared = bad.some((other) => other !== triangle && triangleHasEdge(other, edge[0], edge[1]));
            if (!shared) edges.push(edge);
         }
      }

      triangles = triangles.filter((triangle) => !bad.includes(triangle));
      for (const edge of edges) triangles.push([edge[0], edge[1], i]);
   }

   return triangles.filter((triangle) => triangle[0] < count && triangle[1] < count && triangle[2] < count);
}

/**
 * Warp the source canvas through a single affine triangle into the target
 * rendering context.
 *
 * @param {CanvasRenderingContext2D} ctx - Target rendering context.
 * @param {HTMLCanvasElement} source - Source matte canvas.
 * @param {Point} s0 - First source point.
 * @param {Point} s1 - Second source point.
 * @param {Point} s2 - Third source point.
 * @param {Point} d0 - First destination point.
 * @param {Point} d1 - Second destination point.
 * @param {Point} d2 - Third destination point.
 * @returns {void}
 */
function warpTriangle(ctx, source, s0, s1, s2, d0, d1, d2) {
   ctx.save();
   ctx.beginPath();
   ctx.moveTo(d0.x, d0.y);
   ctx.lineTo(d1.x, d1.y);
   ctx.lineTo(d2.x, d2.y);
   ctx.closePath();
   ctx.clip();

   const denominator = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
   if (Math.abs(denominator) < 1e-6) {
      ctx.restore();
      return;
   }

   const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denominator;
   const b = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denominator;
   const c = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denominator;
   const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denominator;
   const e = d0.x - a * s0.x - b * s0.y;
   const f = d0.y - c * s0.x - d * s0.y;

   ctx.setTransform(a, c, b, d, e, f);
   ctx.drawImage(source, 0, 0);
   ctx.restore();
}

/**
 * Read the current transfer controls as typed values.
 *
 * @returns {{threshold:number, feather:number, opacity:number, blend:GlobalCompositeOperation, useMesh:boolean}} Transfer parameters.
 */
function readParams() {
   return {
      threshold: Number(byId('thr').value),
      feather: Number(byId('fth').value),
      opacity: Number(byId('op').value) / 100,
      blend: byId('blend').value,
      useMesh: byId('useMesh').checked
   };
}

/**
 * Draw the extracted matte into the side preview canvas.
 *
 * @param {HTMLCanvasElement} matte - Canonical matte canvas.
 * @returns {void}
 */
function drawMattePreview(matte) {
   const preview = byId('matte');
   preview.width = 180;
   preview.height = 180;
   const ctx = ctx2d(preview);
   ctx.clearRect(0, 0, 180, 180);
   ctx.drawImage(matte, 0, 0, 180, 180);
}

/**
 * Run extraction and compositing, using mesh warping when landmarks are
 * available and falling back to direct box placement otherwise.
 *
 * @returns {Promise<string>} Translation key for the mode used.
 */
async function transfer() {
   const params = readParams();
   setMessage('transfer_msg_extracting');
   const matte = extractMatte(params.threshold, params.feather);
   drawMattePreview(matte);

   const target = slots.target;
   if (!target.img || !target.box) throw new Error('Target image or box is missing.');

   let resultWidth = target.img.width;
   let resultHeight = target.img.height;
   const longEdge = Math.max(resultWidth, resultHeight);
   if (longEdge > RESULT_MAX) {
      const ratio = RESULT_MAX / longEdge;
      resultWidth = Math.round(resultWidth * ratio);
      resultHeight = Math.round(resultHeight * ratio);
   }

   const result = document.createElement('canvas');
   result.width = resultWidth;
   result.height = resultHeight;
   const resultCtx = ctx2d(result);
   resultCtx.drawImage(target.img, 0, 0, resultWidth, resultHeight);

   const scaleX = resultWidth / target.img.width;
   const scaleY = resultHeight / target.img.height;
   let modeKey = 'transfer_mode_box';
   let modeParams = {};

   if (params.useMesh && faceapiReady) {
      setMessage('transfer_msg_detecting');
      const [afterLandmarks, targetLandmarks] = await Promise.all([
         detectLandmarks('after'),
         detectLandmarks('target')
      ]);

      if (afterLandmarks && targetLandmarks && slots.after.box) {
         const sourcePoints = landmarksToCanon(afterLandmarks, slots.after.box);
         const destinationPoints = targetLandmarks.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
         const triangles = triangulate(sourcePoints);

         resultCtx.globalCompositeOperation = params.blend;
         resultCtx.globalAlpha = params.opacity;
         for (const triangle of triangles) {
            warpTriangle(
               resultCtx,
               matte,
               sourcePoints[triangle[0]],
               sourcePoints[triangle[1]],
               sourcePoints[triangle[2]],
               destinationPoints[triangle[0]],
               destinationPoints[triangle[1]],
               destinationPoints[triangle[2]]
            );
         }
         resultCtx.setTransform(1, 0, 0, 1, 0, 0);
         resultCtx.globalAlpha = 1;
         resultCtx.globalCompositeOperation = 'source-over';
         modeKey = 'transfer_mode_mesh';
         modeParams = { count: triangles.length };
      }
   }

   if (modeKey === 'transfer_mode_box') {
      const box = target.box;
      resultCtx.globalCompositeOperation = params.blend;
      resultCtx.globalAlpha = params.opacity;
      resultCtx.drawImage(matte, box.x * scaleX, box.y * scaleY, box.w * scaleX, box.h * scaleY);
      resultCtx.globalAlpha = 1;
      resultCtx.globalCompositeOperation = 'source-over';

      if (params.useMesh && faceapiReady) {
         modeKey = 'transfer_mode_box_no_face';
      } else if (params.useMesh) {
         modeKey = 'transfer_mode_box_unavailable';
      }
   }

   const holder = byId('result');
   holder.innerHTML = '';
   holder.appendChild(result);
   lastResultCanvas = result;
   byId('download').disabled = false;
   setModeState(modeKey, modeParams, true);
   setMessage('transfer_msg_done');
   return modeKey;
}

/**
 * Reset images, boxes, previews, output, and controls that are derived from
 * the last transfer.
 *
 * @returns {void}
 */
function resetTransfer() {
   for (const name of Object.keys(slots)) {
      slots[name].img = null;
      slots[name].box = null;
      fitPreview(name);
      refreshSlotNote(name);
   }

   renderResultEmpty();
   ctx2d(byId('matte')).clearRect(0, 0, 180, 180);
   setModeState('transfer_mode_not_run');
   lastResultCanvas = null;
   byId('download').disabled = true;
   refreshState();
}

/**
 * Wire DOM events for file loading, drag-and-drop, controls, commands, locale
 * changes, and the lightweight test API.
 *
 * @returns {void}
 */
function setupTransferPage() {
   initI18n();
   setupLocaleSelect(byId('localeSelect'), () => {
      applyI18n();
      refreshLocalizedState();
   });
   refreshLocalizedState();

   document.querySelectorAll('input[type="file"][data-slot]').forEach((input) => {
      input.addEventListener('change', (event) => {
         const file = event.target.files[0];
         if (file) loadFile(input.dataset.slot, file);
      });
   });

   for (const name of Object.keys(slots)) {
      const stage = byId(`stage-${name}`);
      stage.addEventListener('dragover', (event) => {
         event.preventDefault();
      });
      stage.addEventListener('drop', (event) => {
         event.preventDefault();
         const file = event.dataTransfer.files[0];
         if (file) loadFile(name, file);
      });
   }

   byId('thr').addEventListener('input', (event) => { byId('v-thr').textContent = event.target.value; });
   byId('fth').addEventListener('input', (event) => { byId('v-fth').textContent = event.target.value; });
   byId('op').addEventListener('input', (event) => { byId('v-op').textContent = event.target.value; });

   byId('run').addEventListener('click', () => {
      byId('run').disabled = true;
      transfer()
         .catch((err) => {
            console.error(err);
            setMessage('transfer_msg_error', { message: err instanceof Error ? err.message : String(err) });
         })
         .finally(() => refreshState());
   });

   byId('download').addEventListener('click', () => {
      if (!lastResultCanvas) return;
      lastResultCanvas.toBlob((blob) => {
         if (!blob) return;
         const link = document.createElement('a');
         link.href = URL.createObjectURL(blob);
         link.download = 'ghostyle-transfer.png';
         link.click();
      });
   });

   byId('reset').addEventListener('click', resetTransfer);
   window.addEventListener('resize', () => Object.keys(slots).forEach(fitPreview));
   window.addEventListener('i18n:localeChanged', refreshLocalizedState);

   initFaceapi();

   window.GT = {
      load: (name, url) => loadURL(name, url),
      setBox: (name, box) => {
         slots[name].box = box;
         fitPreview(name);
         refreshState();
      },
      setParams: (options) => {
         if (options.threshold != null) {
            byId('thr').value = options.threshold;
            byId('v-thr').textContent = options.threshold;
         }
         if (options.feather != null) {
            byId('fth').value = options.feather;
            byId('v-fth').textContent = options.feather;
         }
         if (options.opacity != null) {
            byId('op').value = options.opacity;
            byId('v-op').textContent = options.opacity;
         }
         if (options.blend != null) byId('blend').value = options.blend;
         if (options.useMesh != null) byId('useMesh').checked = options.useMesh;
      },
      transfer: () => transfer(),
      resultDataURL: () => (lastResultCanvas ? lastResultCanvas.toDataURL() : null),
      _internal: { triangulate, warpTriangle, extractMatte, slots }
   };
}

setupTransferPage();
