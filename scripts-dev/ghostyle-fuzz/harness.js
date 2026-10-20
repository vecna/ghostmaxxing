/**
 * @module ghostyle-fuzz/harness
 * @description
 * Browser side of scripts-dev/ghostyle-fuzz.cjs. Exposes `window.fuzz`, a set
 * of coarse steps the CLI calls through Playwright:
 *
 *   init        load face-api (the lab's vendored build and weights), MediaPipe
 *               FaceLandmarker and the canonical UV map
 *   scanFrames  MediaPipe on many frames: presence, pose, sharpness
 *   analyse     MediaPipe + face-api on candidate frames: imprints
 *   skinSwatch  median skin colour on the anchor frame
 *   loadAtlas   keep the atlas frames and meshes in memory for a run
 *   control     re-describe the clean frames: drift against the atlas
 *   runTrial    draw, paint and measure one trial
 *   materialise anchor picture + Ghostyle source of one trial
 *
 * Painting goes through the lab's own createUvRenderer (lab-js/
 * ghostyle3d-uv-renderer.js) and the composite is measured exactly like
 * engine.js compositeAndDetect: DETECTOR_OPTIONS first, a score-0.1 retry
 * second. The Ghostyle measured is the generated source itself, imported as a
 * module.
 */

import {
   DETECTOR_OPTIONS,
   MEDIAPIPE_FACE_LANDMARKER_URL,
   MEDIAPIPE_WASM_URL,
   MODEL_URLS,
} from '../../lab-js/config.js';
import { FaceLandmarker, FilesetResolver } from '../../lab-js/vendor/tasks-vision@0.10.35.js';
import { createUvRenderer } from '../../lab-js/ghostyle3d-uv-renderer.js';
import * as core from './fuzz-core.mjs';

const UV_PATH = '/data/face_canonical_uv.json';
const WEAK_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.1 });

const S = {
   landmarker: null,
   uvData: null,
   renderer: null,
   headed: false,
   atlas: null,
   frames: [],          // per imprint: { canvas, meshObjects, descriptor }
   anchor: null,        // { meshPx, pxPerCm, triangles, uv }
   recipe: null,
   recipeId: null,
   // One stable object for the renderer's texture cache (a WeakMap keyed by
   // module): the trial's own module is swapped in, and a per-trial params
   // value forces the texture to be repainted.
   slot: { textureSize: core.GHOSTYLE_TEXTURE_SIZE, current: null, paintUV(ctx, params) { this.current.paintUV(ctx, params); } },
};

const statusEl = () => document.getElementById('status');
function status(text) { const el = statusEl(); if (el) el.textContent = text; }

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

async function loadCanvas(url) {
   const response = await fetch(url);
   if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
   const bitmap = await createImageBitmap(await response.blob());
   const canvas = document.createElement('canvas');
   canvas.width = bitmap.width;
   canvas.height = bitmap.height;
   canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);
   bitmap.close();
   return canvas;
}

function mediapipe(canvas) {
   const result = S.landmarker.detect(canvas);
   const landmarks = result.faceLandmarks && result.faceLandmarks[0];
   if (!landmarks) return null;
   const matrix = result.facialTransformationMatrixes && result.facialTransformationMatrixes[0];
   const mesh = landmarks.map((p) => [core.round(p.x, 5), core.round(p.y, 5), core.round(p.z, 5)]);
   const pose = matrix ? core.poseFromMatrix(Array.from(matrix.data)) : null;
   return { mesh, pose };
}

/** Image cues used to check the pose signs (tutorials/ghostyle-fuzz.md §4.2). */
function poseCues(meshPx) {
   const nose = meshPx[1];
   const left = meshPx[234];
   const right = meshPx[454];
   const width = core.dist2d(left, right) || 1;
   const eyes = { x: (meshPx[33].x + meshPx[263].x) / 2, y: (meshPx[33].y + meshPx[263].y) / 2 };
   const mouth = { x: (meshPx[13].x + meshPx[14].x) / 2, y: (meshPx[13].y + meshPx[14].y) / 2 };
   const outerRight = meshPx[33];
   const outerLeft = meshPx[263];
   return {
      yawCue: core.round((nose.x - (left.x + right.x) / 2) / width, 3),
      pitchCue: core.round((nose.y - eyes.y) / ((mouth.y - eyes.y) || 1), 3),
      rollCue: core.round((Math.atan2(outerLeft.y - outerRight.y, outerLeft.x - outerRight.x) * 180) / Math.PI, 2),
   };
}

/** Variance of the Laplacian on a 160-px grey crop around the face oval. */
function sharpness(canvas, meshPx) {
   const oval = core.LANDMARK_SETS.faceOval.map((i) => meshPx[i]);
   const xs = oval.map((p) => p.x);
   const ys = oval.map((p) => p.y);
   const x0 = Math.max(0, Math.min(...xs));
   const y0 = Math.max(0, Math.min(...ys));
   const w = Math.min(canvas.width, Math.max(...xs)) - x0;
   const h = Math.min(canvas.height, Math.max(...ys)) - y0;
   if (w < 8 || h < 8) return 0;
   const outW = 160;
   const outH = Math.max(8, Math.round((h / w) * outW));
   const tmp = document.createElement('canvas');
   tmp.width = outW;
   tmp.height = outH;
   const ctx = tmp.getContext('2d', { willReadFrequently: true });
   ctx.drawImage(canvas, x0, y0, w, h, 0, 0, outW, outH);
   const data = ctx.getImageData(0, 0, outW, outH).data;
   const grey = new Float32Array(outW * outH);
   for (let i = 0, j = 0; j < grey.length; i += 4, j += 1) grey[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
   return core.round(core.laplacianVariance(grey, outW, outH), 2);
}

async function describe(canvas, allowWeak) {
   let result = await faceapi.detectSingleFace(canvas, DETECTOR_OPTIONS).withFaceLandmarks().withFaceDescriptor();
   let detection = result ? 'ok' : 'lost';
   if (!result && allowWeak) {
      result = await faceapi.detectSingleFace(canvas, WEAK_OPTIONS).withFaceLandmarks().withFaceDescriptor();
      if (result) detection = 'weak';
   }
   return { result, detection };
}

function show(canvas, text) {
   if (!S.headed) return;
   const view = document.getElementById('view');
   if (view.width !== canvas.width || view.height !== canvas.height) {
      view.width = canvas.width;
      view.height = canvas.height;
   }
   view.getContext('2d').drawImage(canvas, 0, 0);
   status(text);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function init({ gpu = false, headed = false } = {}) {
   S.headed = headed;
   status('loading face-api models');
   await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.recognition),
   ]);
   status('loading MediaPipe FaceLandmarker');
   const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
   S.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_URL, delegate: gpu ? 'GPU' : 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
   });
   const response = await fetch(UV_PATH);
   S.uvData = await response.json();
   S.renderer = createUvRenderer({ uvPath: UV_PATH });
   await S.renderer.ensureLoaded();
   // Warm-up so the first timing is not the shader compilation.
   const warm = document.createElement('canvas');
   warm.width = 160; warm.height = 160;
   await faceapi.detectSingleFace(warm, DETECTOR_OPTIONS);
   status('ready');
   return {
      backend: faceapi.tf && faceapi.tf.getBackend ? faceapi.tf.getBackend() : null,
      faceapiVersion: faceapi.version || null,
      triangles: S.uvData.numTriangles,
      userAgent: navigator.userAgent,
   };
}

/** MediaPipe on each frame: presence, pose, sharpness, scale. */
async function scanFrames(items) {
   const out = [];
   for (const item of items) {
      const canvas = await loadCanvas(item.url);
      const mp = mediapipe(canvas);
      if (!mp || !mp.pose) { out.push({ n: item.n, present: false }); continue; }
      const meshPx = core.meshToPx(mp.mesh, canvas.width, canvas.height);
      out.push({
         n: item.n,
         present: true,
         pose: mp.pose,
         sharpness: sharpness(canvas, meshPx),
         cues: poseCues(meshPx),
         ...core.irisScale(meshPx),
      });
      status(`scan frame ${item.n}`);
   }
   return out;
}

/** MediaPipe + face-api on candidate frames (lossless PNGs). */
async function analyse(items) {
   const out = [];
   for (const item of items) {
      const canvas = await loadCanvas(item.url);
      const mp = mediapipe(canvas);
      if (!mp || !mp.pose) { out.push({ key: item.key, mediapipe: false, faceapi: null }); continue; }
      const meshPx = core.meshToPx(mp.mesh, canvas.width, canvas.height);
      const { result } = await describe(canvas, false);
      out.push({
         key: item.key,
         mediapipe: true,
         width: canvas.width,
         height: canvas.height,
         pose: mp.pose,
         mesh: mp.mesh,
         sharpness: sharpness(canvas, meshPx),
         cues: poseCues(meshPx),
         ...core.irisScale(meshPx),
         faceapi: result ? {
            score: core.round(result.detection.score, 4),
            box: ['x', 'y', 'width', 'height'].reduce((acc, k) => ({ ...acc, [k]: core.round(result.detection.box[k], 1) }), {}),
            landmarks68: result.landmarks.positions.map((p) => [core.round(p.x, 1), core.round(p.y, 1)]),
            descriptor: Array.from(result.descriptor).map((v) => core.round(v, 6)),
         } : null,
      });
      show(canvas, `analysed ${item.key}: ${result ? `face-api ${result.detection.score.toFixed(2)}` : 'face-api found no face'}`);
   }
   return out;
}

/**
 * Skin swatch on the anchor: face oval above the nose base, minus eyes,
 * brows and lips (each grown by 2.5 mm); per-channel median in CIELAB.
 */
async function skinSwatch({ url, mesh, pxPerCm }) {
   const canvas = await loadCanvas(url);
   const meshPx = core.meshToPx(mesh, canvas.width, canvas.height);
   const hulls = core.regionHulls(meshPx);
   const mask = document.createElement('canvas');
   mask.width = canvas.width;
   mask.height = canvas.height;
   const m = mask.getContext('2d', { willReadFrequently: true });
   const path = (poly) => { m.beginPath(); poly.forEach((p, i) => (i ? m.lineTo(p.x, p.y) : m.moveTo(p.x, p.y))); m.closePath(); };
   m.fillStyle = '#fff';
   path(hulls.faceOval); m.fill();
   m.globalCompositeOperation = 'destination-out';
   m.lineWidth = 0.5 * pxPerCm;
   m.lineJoin = 'round';
   for (const poly of [...hulls.eyes, ...hulls.brows, ...hulls.lips]) { path(poly); m.fill(); m.stroke(); }
   // Below the nose base: beard, stubble and the shadow under the mouth are
   // not skin colour. Cut the half-plane under the line through landmark 2
   // (subnasale), parallel to the eye axis.
   const e0 = meshPx[33];
   const e1 = meshPx[263];
   const len = Math.hypot(e1.x - e0.x, e1.y - e0.y) || 1;
   const d = { x: (e1.x - e0.x) / len, y: (e1.y - e0.y) / len };
   let n = { x: -d.y, y: d.x };
   const chin = meshPx[152];
   const base = meshPx[2];
   if ((chin.x - base.x) * n.x + (chin.y - base.y) * n.y < 0) n = { x: -n.x, y: -n.y };
   const far = 4 * (canvas.width + canvas.height);
   path([
      { x: base.x - d.x * far, y: base.y - d.y * far },
      { x: base.x + d.x * far, y: base.y + d.y * far },
      { x: base.x + d.x * far + n.x * far, y: base.y + d.y * far + n.y * far },
      { x: base.x - d.x * far + n.x * far, y: base.y - d.y * far + n.y * far },
   ]);
   m.fill();
   const maskData = m.getImageData(0, 0, mask.width, mask.height).data;
   const pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
   const lab = [];
   const R = []; const G = []; const B = [];
   for (let i = 0; i < maskData.length; i += 4) {
      if (maskData[i + 3] < 200) continue;
      const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
      lab.push(core.rgbToLab(rgb));
      R.push(rgb[0]); G.push(rgb[1]); B.push(rgb[2]);
   }
   const swatch = core.skinSwatchFromLab(lab);
   const rgbMedian = [core.median(R), core.median(G), core.median(B)].map(Math.round);
   // Preview: the pixels that entered the median, tinted green.
   const tinted = document.createElement('canvas');
   tinted.width = canvas.width;
   tinted.height = canvas.height;
   const tctx = tinted.getContext('2d');
   tctx.drawImage(mask, 0, 0);
   tctx.globalCompositeOperation = 'source-in';
   tctx.fillStyle = '#00ff88';
   tctx.fillRect(0, 0, tinted.width, tinted.height);
   const preview = document.createElement('canvas');
   preview.width = canvas.width;
   preview.height = canvas.height;
   const p = preview.getContext('2d');
   p.drawImage(canvas, 0, 0);
   p.globalAlpha = 0.4;
   p.drawImage(tinted, 0, 0);
   return { ...swatch, region: 'face oval above the nose base, minus eyes and brows (grown by 2.5 mm)', rgbMedianForDisplay: rgbMedian, hexForDisplay: core.rgbToHex(rgbMedian), maskPreview: preview.toDataURL('image/jpeg', 0.85) };
}

/** Keep the atlas in memory for a trial run. */
async function loadAtlas({ atlasUrl, recipe, recipeId }) {
   const response = await fetch(atlasUrl);
   const atlas = await response.json();
   const base = atlasUrl.replace(/[^/]*$/, '');
   S.atlas = atlas;
   S.recipe = recipe;
   S.recipeId = recipeId;
   S.frames = [];
   for (const imp of atlas.imprints) {
      const canvas = await loadCanvas(base + imp.framePath);
      S.frames.push({
         canvas,
         meshObjects: imp.mesh.map(([x, y, z]) => ({ x, y, z })),
         descriptor: imp.descriptor,
      });
      status(`loaded imprint ${imp.id}`);
   }
   const anchor = atlas.imprints.find((imp) => imp.id === atlas.anchorId);
   S.anchor = {
      meshPx: core.meshToPx(anchor.mesh, anchor.width, anchor.height),
      pxPerCm: anchor.pxPerCm,
      triangles: S.uvData.triangles,
      uv: S.uvData.uv,
      index: atlas.imprints.indexOf(anchor),
   };
   return { imprints: S.frames.length, anchorIndex: S.anchor.index };
}

/** Clean frames described again: drift of this environment against the atlas. */
async function control() {
   const out = [];
   for (let i = 0; i < S.frames.length; i += 1) {
      const { result } = await describe(S.frames[i].canvas, true);
      out.push(result ? core.round(core.euclidean(Array.from(result.descriptor), S.frames[i].descriptor), 6) : null);
   }
   return out;
}

async function importSource(source) {
   const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
   try {
      return await import(url);
   } finally {
      URL.revokeObjectURL(url);
   }
}

function composite(frameIndex, seed) {
   const frame = S.frames[frameIndex];
   const out = document.createElement('canvas');
   out.width = frame.canvas.width;
   out.height = frame.canvas.height;
   const overlay = document.createElement('canvas');
   overlay.width = out.width;
   overlay.height = out.height;
   S.renderer.render(S.slot, overlay.getContext('2d'), frame.meshObjects, { trial: seed });
   const ctx = out.getContext('2d');
   ctx.drawImage(frame.canvas, 0, 0);
   ctx.drawImage(overlay, 0, 0);
   return out;
}

function trialSource(draw, extraComment = '') {
   return core.buildGhostyleSource({
      recipe: S.recipe,
      recipeId: S.recipeId,
      seed: draw.seed,
      strokes: draw.strokes,
      palette: draw.palette,
      date: new Date().toISOString().slice(0, 10),
      atlasSource: S.atlas.source && S.atlas.source.file,
      extraComment,
   });
}

/**
 * Draw, paint and measure one trial.
 *
 * @param {{seed: number, subset: number[], prune: ?{escape: number, worst: number, margin: number}}} args
 */
async function runTrial({ seed, subset = [], prune = null }) {
   const started = performance.now();
   const draw = core.drawTrial(seed, S.recipe, S.anchor, S.atlas.skinSwatch.lab);
   S.slot.current = await importSource(trialSource(draw));
   const imprints = S.atlas.imprints;
   const order = subset.concat(imprints.map((_, i) => i).filter((i) => !subset.includes(i)));
   const rows = [];
   let pruned = false;
   for (let k = 0; k < order.length; k += 1) {
      const i = order[k];
      const canvas = composite(i, seed);
      const { result, detection } = await describe(canvas, true);
      rows.push(core.profileRow(imprints[i], result ? Array.from(result.descriptor) : null, imprints, detection, result ? result.detection.score : null));
      show(canvas, `seed ${seed} · imprint ${imprints[i].id} (yaw ${imprints[i].yaw}°) · ${detection}${result ? ` · dAtlas ${rows[rows.length - 1].dAtlas}` : ''}`);
      if (prune && k === subset.length - 1) {
         const escaped = rows.filter((row) => core.escapes(row)).length / rows.length;
         const measured = rows.filter((row) => row.dAtlas !== null).map((row) => row.dAtlas);
         const worst = measured.length ? Math.min(...measured) : Infinity;
         if (escaped < prune.escape - prune.margin && worst < prune.worst) { pruned = true; break; }
      }
   }
   rows.sort((a, b) => a.id - b.id);
   return { seed, palette: draw.palette, strokes: draw.strokes, coverage: draw.coverage, rows, pruned, ms: Math.round(performance.now() - started) };
}

/** Anchor frame with the overlay, and the Ghostyle source, for one trial. */
async function materialise({ seed, extraComment = '', rows = [] }) {
   const draw = core.drawTrial(seed, S.recipe, S.anchor, S.atlas.skinSwatch.lab);
   const source = trialSource(draw, extraComment);
   S.slot.current = await importSource(source);
   const canvas = composite(S.anchor.index, seed);
   show(canvas, `materialised seed ${seed}`);
   return { source, jpeg: canvas.toDataURL('image/jpeg', 0.9), sheet: contactSheet(seed, rows) };
}

/**
 * Every imprint with the overlay, face-cropped, in a grid, labelled with
 * pose and result: the evidence that the overlay follows the skin.
 */
function contactSheet(seed, rows) {
   const byId = new Map(rows.map((row) => [row.id, row]));
   const imprints = S.atlas.imprints;
   const cellW = 220;
   const cellH = 280;
   const cols = Math.min(6, imprints.length);
   const sheet = document.createElement('canvas');
   sheet.width = cols * cellW;
   sheet.height = Math.ceil(imprints.length / cols) * cellH;
   const ctx = sheet.getContext('2d');
   ctx.fillStyle = '#14161a';
   ctx.fillRect(0, 0, sheet.width, sheet.height);
   imprints.forEach((imp, i) => {
      const frame = composite(i, seed);
      const meshPx = core.meshToPx(imp.mesh, imp.width, imp.height);
      const oval = core.LANDMARK_SETS.faceOval.map((k) => meshPx[k]);
      const xs = oval.map((p) => p.x);
      const ys = oval.map((p) => p.y);
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.25;
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;
      const side = cellW - 10;
      ctx.drawImage(frame, cx - size / 2, cy - (size * 1.1) / 2, size, size * 1.1, x + 5, y + 5, side, side * 1.1);
      const row = byId.get(imp.id);
      const verdict = !row ? '' : row.detection === 'lost' ? 'face lost' : `dAtlas ${row.dAtlas.toFixed(2)}${row.detection === 'weak' ? ' (weak)' : ''}`;
      const escaped = row && core.escapes(row);
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = '#c8d0e0';
      ctx.fillText(`#${imp.id} ${imp.t.toFixed(1)}s yaw ${imp.yaw.toFixed(0)} pitch ${imp.pitch.toFixed(0)}`, x + 6, y + side * 1.1 + 20);
      ctx.fillStyle = !row ? '#c8d0e0' : escaped ? '#4be3a0' : '#ff6b6b';
      ctx.fillText(verdict, x + 6, y + side * 1.1 + 36);
   });
   return sheet.toDataURL('image/jpeg', 0.85);
}

window.fuzz = { init, scanFrames, analyse, skinSwatch, loadAtlas, control, runTrial, materialise };
window.fuzzReady = true;
status('harness loaded, waiting for the CLI');
