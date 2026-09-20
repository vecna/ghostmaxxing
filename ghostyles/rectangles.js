/**
 * ==Ghostyle==
 * @name         Rectangles
 * @slug         rectangles
 * @version      1.0.0
 * @author       vecna
 * @license      AGPL-3.0-only
 * @release_date 2026-09-20
 * @description  Blocks of two alternating colours on a grid aligned with the eyes, denser around the eyes and the mouth, sizes and colours decided by formula. Near-opaque paint anchored to the face-api landmarks.
 * @technique    geometric
 * @supports     2d
 * @regions      skin, forehead, cheeks, nose, brows, eyes, mouth
 * @evidence     experimental
 * ==/Ghostyle==
 */

// ---------------------------------------------------------------------------
// WHAT THIS GHOSTYLE DOES
//
// It reproduces the "rectangles" family of face paint: flat blocks of two
// colours, of different sizes, laid on a grid that follows the face. Nothing
// is copied from a photograph. A grid is built in the face's own frame (unit
// = distance between the eyes, axes = along the eye line and down the face),
// and for every cell a deterministic hash decides whether a block starts
// there, how many cells it spans, and which colour it takes. The probability
// of a block is highest around the eyes and the mouth, which is where a
// recogniser looks hardest, and lowest at the edges of the face.
//
// The eyeballs and the lips are left uncovered through a clip mask, because
// that is what paint on a real face does.
//
// HOW IT PLUGS INTO THE ENGINE
//
// Only `onDraw(ctx, landmarks)` is implemented. The engine calls it on the
// visible overlay every tick, and `compositeAndDetect()` calls the very same
// function on the offscreen frame that is re-detected, so what is painted
// here is exactly what the matcher is scored against.
//
// The controls (two colours, opacity, block size, density, shuffle) are a
// self-contained panel built the way brush.js builds its own: mounted in the
// lab's reserved `#gm-pluginbar-mount` when that slot is present and visible,
// floating at the bottom of the viewport otherwise. No lab file needs to
// change.
// ---------------------------------------------------------------------------

const ID = 'rectangles';
const G = (typeof window !== 'undefined' && (window.gstmxx || window.Ghostati)) || {};
function log(message) {
   if (typeof G.log === 'function') G.log(message, 'Rectangles');
}

// ===========================================================================
// GEOMETRY: WHERE THE DOTS ARE USED
//
// Every number below is in INTER-OCULAR UNITS ("iod"): 1.0 is the distance
// between the two eye centres of the face on screen. A face far from the
// camera has a small iod and gets small blocks; a face close to the camera
// gets large ones; the pattern keeps its proportions. Nothing is in pixels.
//
// Directions: +x runs along the line joining the eyes, from the eye on the
// LEFT of the frame (face-api points 36-41) towards the eye on the RIGHT
// (points 42-47). +y is perpendicular to that, DOWN the face. The origin is
// the midpoint between the eyes. Both axes rotate with the head, so the grid
// tilts with it, the way paint does.
//
// The face-api 68 points, for reference:
//    0-16  jaw line, ear to ear through the chin (8 = chin tip)
//   17-21  left brow, 22-26 right brow
//   27-35  nose (27 = bridge top, 30 = tip)
//   36-41  left eye, 42-47 right eye
//   48-59  outer lip contour, 60-67 inner lip contour
// ===========================================================================

/** Named points computed from the landmarks each frame (see FOCUS). */
const ANCHOR_INDICES = {
   leftEye: [36, 37, 38, 39, 40, 41],
   rightEye: [42, 43, 44, 45, 46, 47],
   mouth: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
   noseTip: [30],
   browMid: [21, 22],
};

/**
 * GRID
 *
 *   CELL      side of one grid cell, in iod. 0.26 gives about four cells
 *             across the space between the eyes; blocks span 1 to 3 cells,
 *             so the largest block is ~0.8 iod wide, roughly an eye socket.
 *   U_RANGE   horizontal extent of the grid, in iod from the origin: the
 *             face is about 3.2 iod wide at the cheekbones, so +/-1.75
 *             covers it with margin. Anything outside the face mask is
 *             clipped anyway.
 *   V_RANGE   vertical extent: -1.6 (above the hairline) to +2.2 (below the
 *             chin, ~1.9 iod under the eye line).
 *   GAP       bare skin left around each block, in iod, so adjacent blocks
 *             read as separate pieces. 0 makes them touch.
 *   SPAN_W    block widths, in cells, chosen by hash with equal probability
 *   SPAN_H    block heights, in cells
 */
const CELL = 0.26;
const U_RANGE = [-1.75, 1.75];
const V_RANGE = [-1.6, 2.2];
const GAP = 0.02;
const SPAN_W = [1, 1, 2, 2, 3];
const SPAN_H = [1, 1, 2];

/**
 * FOCUS: where blocks are more likely.
 *
 * The probability that a block starts in a cell is
 *
 *    p = BASE_DENSITY + sum over FOCUS of  weight * exp(-(d / radius)^2)
 *
 * capped at MAX_DENSITY, where d is the distance (iod) from the cell centre
 * to the focus anchor (plus its offset). A Gaussian falloff, so the density
 * is highest at the anchor and fades to the base value about 1.5 radii
 * away.
 *
 *   - eyes: radius 0.75 iod reaches the brow, the temple and the top of the
 *     cheekbone; weight 0.55 on top of the base makes the eye sockets nearly
 *     solid. These are the two entries to keep if anything is trimmed.
 *   - mouth: radius 0.8 iod, offset 0.1 down so the chin gets as much as the
 *     upper lip; the lips themselves are a hole in the mask.
 *   - nose bridge (browMid): a small boost so the block field crosses the
 *     midline instead of leaving a bare stripe down the nose.
 *
 * To lean further towards the eyes and mouth: raise their weights or lower
 * BASE_DENSITY. To fill the whole face evenly: raise BASE_DENSITY and set the
 * weights to 0.
 */
const BASE_DENSITY_DEFAULT = 0.22;
const MAX_DENSITY = 0.92;
const FOCUS = [
   { anchor: 'leftEye',  dx: 0.00, dy: 0.05, radius: 0.75, weight: 0.55 },
   { anchor: 'rightEye', dx: 0.00, dy: 0.05, radius: 0.75, weight: 0.55 },
   { anchor: 'mouth',    dx: 0.00, dy: 0.10, radius: 0.80, weight: 0.45 },
   { anchor: 'browMid',  dx: 0.00, dy: 0.35, radius: 0.45, weight: 0.25 },
];

/**
 * MASK: where paint is allowed (same construction as circular-fragments).
 *
 *   HAIRLINE_LIFT  brow points lifted this many iod give the top edge
 *   TEMPLE_LIFT    how far above the jaw ends the side edges rise
 *   EYE_HOLE       eyelid contour scaled from the eye centre; the eyes stay bare
 *   MOUTH_HOLE     outer lip contour scaled likewise; null to paint the lips
 */
const HAIRLINE_LIFT = 0.85;
const TEMPLE_LIFT = 0.55;
const EYE_HOLE = 1.35;
const MOUTH_HOLE = 1.12;

// ===========================================================================
// SETTINGS (live, from the panel)
// ===========================================================================

const DEFAULTS = {
   colorA: '#963238',   // red, sampled from the reference paint
   colorB: '#dfa64c',   // yellow
   alpha: 0.9,          // real paint is opaque; 0.9 leaves the skin texture faintly visible
   scale: 1.0,          // multiplies CELL
   density: BASE_DENSITY_DEFAULT,
   seed: 3,             // which cells get blocks; "Shuffle" changes it
};
const settings = { ...DEFAULTS };

// ===========================================================================
// GEOMETRY HELPERS
// ===========================================================================

function avg(points) {
   let x = 0;
   let y = 0;
   for (const p of points) { x += p.x; y += p.y; }
   return { x: x / points.length, y: y / points.length };
}

/** Face frame: origin between the eyes, unit = iod, x along the eyes, y down. */
function faceFrame(positions) {
   const le = avg(ANCHOR_INDICES.leftEye.map((i) => positions[i]));
   const re = avg(ANCHOR_INDICES.rightEye.map((i) => positions[i]));
   const dx = re.x - le.x;
   const dy = re.y - le.y;
   const iod = Math.max(1, Math.hypot(dx, dy));
   const xhat = { x: dx / iod, y: dy / iod };
   const yhat = { x: -xhat.y, y: xhat.x };
   return { origin: { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 }, iod, xhat, yhat };
}

/** Canvas point -> face-frame coordinates (iod units). */
function toFrame(p, frame) {
   const dx = p.x - frame.origin.x;
   const dy = p.y - frame.origin.y;
   return {
      u: (dx * frame.xhat.x + dy * frame.xhat.y) / frame.iod,
      v: (dx * frame.yhat.x + dy * frame.yhat.y) / frame.iod,
   };
}

/** A point in iod units relative to a canvas point -> canvas pixels. */
function offset(base, frame, dx, dy) {
   return {
      x: base.x + frame.iod * (frame.xhat.x * dx + frame.yhat.x * dy),
      y: base.y + frame.iod * (frame.xhat.y * dx + frame.yhat.y * dy),
   };
}

function anchorPoint(name, positions) {
   const indices = ANCHOR_INDICES[name] || ANCHOR_INDICES.noseTip;
   return avg(indices.map((i) => positions[i]));
}

function scaleFrom(centre, p, k) {
   return { x: centre.x + (p.x - centre.x) * k, y: centre.y + (p.y - centre.y) * k };
}

/** Deterministic pseudo-random number in [0, 1) from integer coordinates. */
function hash01(seed, a, b, c) {
   let h = (seed * 0x9e3779b1) ^ 0x85ebca6b;
   h = Math.imul(h ^ (a + 1000), 0xc2b2ae35);
   h = Math.imul(h ^ (h >>> 15) ^ (b + 1000), 0x27d4eb2f);
   h = Math.imul(h ^ (h >>> 13) ^ (c + 1000), 0x165667b1);
   h ^= h >>> 16;
   return (h >>> 0) / 4294967296;
}

/** Clip to the face polygon with the eyes (and lips) cut out; even-odd rule. */
function clipToFace(ctx, positions, frame) {
   const jaw = positions.slice(0, 17);
   const brows = positions.slice(17, 27);
   ctx.beginPath();
   ctx.moveTo(jaw[0].x, jaw[0].y);
   for (let i = 1; i < jaw.length; i += 1) ctx.lineTo(jaw[i].x, jaw[i].y);
   const rightTemple = offset(jaw[16], frame, 0, -TEMPLE_LIFT);
   ctx.lineTo(rightTemple.x, rightTemple.y);
   for (let i = brows.length - 1; i >= 0; i -= 1) {
      const p = offset(brows[i], frame, 0, -HAIRLINE_LIFT);
      ctx.lineTo(p.x, p.y);
   }
   const leftTemple = offset(jaw[0], frame, 0, -TEMPLE_LIFT);
   ctx.lineTo(leftTemple.x, leftTemple.y);
   ctx.closePath();

   const hole = (indices, k) => {
      const pts = indices.map((i) => positions[i]);
      const c = avg(pts);
      const ring = pts.map((p) => scaleFrom(c, p, k));
      ctx.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i].x, ring[i].y);
      ctx.closePath();
   };
   hole(ANCHOR_INDICES.leftEye, EYE_HOLE);
   hole(ANCHOR_INDICES.rightEye, EYE_HOLE);
   if (MOUTH_HOLE) hole(ANCHOR_INDICES.mouth, MOUTH_HOLE);

   ctx.clip('evenodd');
}

// ===========================================================================
// DRAWING
// ===========================================================================

export function onDraw(ctx, landmarks) {
   if (!landmarks || !landmarks.positions || landmarks.positions.length < 68) return;
   const positions = landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
   const frame = faceFrame(positions);

   if (ctx.canvas.isConnected) noteFrame(); // the visible overlay, not the offscreen composite

   // Focus anchors, in face-frame coordinates, once per frame.
   const focus = FOCUS.map((f) => {
      const p = toFrame(anchorPoint(f.anchor, positions), frame);
      return { u: p.u + f.dx, v: p.v + f.dy, radius: f.radius, weight: f.weight };
   });
   const density = (u, v) => {
      let p = settings.density;
      for (const f of focus) {
         const d = Math.hypot(u - f.u, v - f.v) / f.radius;
         p += f.weight * Math.exp(-d * d);
      }
      return Math.min(MAX_DENSITY, p);
   };

   ctx.save();
   clipToFace(ctx, positions, frame);
   ctx.globalAlpha = settings.alpha;

   // From here on, coordinates are in iod units in the face frame: the
   // transform maps (u, v) to origin + iod * (u * xhat + v * yhat).
   ctx.transform(
      frame.iod * frame.xhat.x, frame.iod * frame.xhat.y,
      frame.iod * frame.yhat.x, frame.iod * frame.yhat.y,
      frame.origin.x, frame.origin.y,
   );

   const cell = CELL * settings.scale;
   const cols = Math.ceil((U_RANGE[1] - U_RANGE[0]) / cell);
   const rows = Math.ceil((V_RANGE[1] - V_RANGE[0]) / cell);
   const palette = [settings.colorA, settings.colorB];
   const occupied = new Uint8Array(cols * rows);

   // Row by row, left to right. A block claims the cells it covers so the
   // next block starts on bare skin; that is what gives the mix of sizes.
   for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
         if (occupied[j * cols + i]) continue;
         const u0 = U_RANGE[0] + i * cell;
         const v0 = V_RANGE[0] + j * cell;
         const roll = hash01(settings.seed, i, j, 0);
         if (roll >= density(u0 + cell / 2, v0 + cell / 2)) continue;

         const w = SPAN_W[Math.floor(hash01(settings.seed, i, j, 1) * SPAN_W.length)];
         const h = SPAN_H[Math.floor(hash01(settings.seed, i, j, 2) * SPAN_H.length)];
         for (let jj = j; jj < Math.min(rows, j + h); jj += 1) {
            for (let ii = i; ii < Math.min(cols, i + w); ii += 1) occupied[jj * cols + ii] = 1;
         }

         ctx.fillStyle = palette[hash01(settings.seed, i, j, 3) < 0.5 ? 0 : 1];
         ctx.fillRect(u0 + GAP, v0 + GAP, w * cell - GAP * 2, h * cell - GAP * 2);
      }
   }

   ctx.restore();
}

// ===========================================================================
// CONTROL PANEL (self-contained, after brush.js)
// ===========================================================================

let panel = null;
let busBound = false;
let lastFaceAt = 0;
let watch = null;

function noteFrame() {
   lastFaceAt = Date.now();
   if (!panel) openPanel();
}

/**
 * The lab reserves `#gm-pluginbar-mount` for plugin controls but reveals the
 * bar only for Ghostyles it knows by id and has pinned to a rail slot, so a
 * panel mounted there can be invisible. Use the mount when the bar is shown,
 * float otherwise, re-checked every second while active.
 */
function placePanel() {
   if (!panel) return;
   const mount = document.getElementById('gm-pluginbar-mount');
   const bar = document.getElementById('gm-pluginbar');
   const barVisible = Boolean(mount && bar && bar.classList.contains('show'));
   const target = barVisible ? mount : document.body;
   if (panel.parentNode !== target) target.appendChild(panel);
   panel.style.cssText = panelStyle(!barVisible);
}

function panelStyle(floating) {
   const shared = [
      'display:flex', 'flex-wrap:wrap', 'gap:10px', 'align-items:center',
      'pointer-events:auto', 'color:var(--fg,#eef2ff)',
      'font:13px/1.2 var(--sans,system-ui),sans-serif',
   ];
   if (!floating) return shared.join(';');
   return shared.concat([
      'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
      'z-index:400', 'padding:10px 14px', 'border-radius:12px',
      'background:var(--panel,rgba(15,17,21,0.86))', 'backdrop-filter:blur(8px)',
      'border:1px solid var(--line,rgba(255,255,255,0.12))',
      'box-shadow:0 8px 30px rgba(0,0,0,0.45)', 'max-width:calc(100vw - 24px)',
   ]).join(';');
}

function buildPanel() {
   if (panel) return;
   panel = document.createElement('div');
   panel.setAttribute('data-gstmxx-plugin', ID);

   const label = (text) => {
      const s = document.createElement('span');
      s.textContent = text;
      s.style.opacity = '0.8';
      return s;
   };
   const color = (key, title) => {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = settings[key];
      input.title = title;
      input.style.cssText = 'width:34px;height:26px;border:none;background:none;cursor:pointer';
      input.oninput = () => { settings[key] = input.value; };
      return input;
   };
   const range = (key, min, max, step, title) => {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(settings[key]);
      input.title = title;
      input.oninput = () => { settings[key] = parseFloat(input.value); };
      return input;
   };
   const button = (text, title, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = title;
      b.style.cssText = [
         'padding:6px 10px', 'border-radius:8px', 'cursor:pointer',
         'background:rgba(159,122,234,0.22)', 'border:1px solid rgba(159,122,234,0.5)',
         'color:#fff', 'font:600 12px var(--sans,system-ui),sans-serif',
      ].join(';');
      b.onclick = fn;
      return b;
   };

   const inputs = {
      colorA: color('colorA', 'Colour A'),
      colorB: color('colorB', 'Colour B'),
      alpha: range('alpha', 0.2, 1, 0.05, 'Opacity'),
      scale: range('scale', 0.6, 1.8, 0.05, 'Block size'),
      density: range('density', 0, 0.6, 0.02, 'Base density (eyes and mouth are always denser)'),
   };
   const hint = document.createElement('p');
   hint.setAttribute('data-role', 'hint');
   hint.style.cssText = 'flex-basis:100%;margin:2px 0 0;font-size:12px;line-height:1.45;color:var(--muted,#b9a892)';

   panel.append(
      label('Rectangles'), inputs.colorA, inputs.colorB,
      label('opacity'), inputs.alpha,
      label('size'), inputs.scale,
      label('density'), inputs.density,
      button('Shuffle', 'Lay the blocks out differently', () => { settings.seed = (settings.seed + 1) % 1000; }),
      button('Reset', 'Back to the default colours and layout', () => {
         Object.assign(settings, DEFAULTS);
         inputs.colorA.value = settings.colorA;
         inputs.colorB.value = settings.colorB;
         inputs.alpha.value = String(settings.alpha);
         inputs.scale.value = String(settings.scale);
         inputs.density.value = String(settings.density);
      }),
      hint,
   );
   placePanel();
   updateHint();
}

function updateHint() {
   if (!panel) return;
   const hint = panel.querySelector('[data-role="hint"]');
   if (!hint) return;
   const age = lastFaceAt ? Date.now() - lastFaceAt : Infinity;
   if (age < 1500) { hint.textContent = ''; hint.style.display = 'none'; return; }
   hint.style.display = '';
   hint.textContent = lastFaceAt
      ? 'Lost the face; the blocks come back with it.'
      : 'No face detected yet. The blocks are anchored to facial landmarks, so they need one.';
}

function openPanel() {
   lastFaceAt = 0;
   buildPanel();
   clearInterval(watch);
   watch = setInterval(() => { placePanel(); updateHint(); }, 1000);
}

function closePanel() {
   if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
   panel = null;
   clearInterval(watch);
   watch = null;
   lastFaceAt = 0;
}

/** See brush.js: onInit is a registration hook, the bus event is the activation. */
function bindBus(attempt = 0) {
   if (busBound) return;
   const bus = window.gstmxx && window.gstmxx.events;
   if (!bus) {
      if (attempt < 40) setTimeout(() => bindBus(attempt + 1), 100);
      return;
   }
   busBound = true;
   bus.addEventListener('effectChanged', (event) => {
      const active = event.detail && event.detail.activeEffect;
      if (active === ID) openPanel();
      else if (panel) closePanel();
   });
}

export function onInit() {
   bindBus();
   return 'Rectangles ready: two colours, blocks densest around the eyes and the mouth.';
}

export function onClear() {
   closePanel();
}
