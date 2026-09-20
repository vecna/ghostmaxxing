/**
 * ==Ghostyle==
 * @name         Circular Fragments
 * @slug         circular-fragments
 * @version      1.0.0
 * @author       vecna
 * @license      AGPL-3.0-only
 * @release_date 2026-09-20
 * @description  Concentric rings of two alternating colours, centred on the eyes, the mouth, the cheeks and the forehead, with arc segments knocked out by formula. Two-colour paint, near opaque, anchored to the face-api landmarks.
 * @technique    geometric
 * @supports     2d
 * @regions      skin, forehead, cheeks, nose, brows, eyes, mouth
 * @evidence     experimental
 * ==/Ghostyle==
 */

// ---------------------------------------------------------------------------
// WHAT THIS GHOSTYLE DOES
//
// It reproduces the "circular fragments" family of face paint: thick rings
// of two alternating colours, several rings around each centre, several
// centres on the face, and pieces of every ring missing so the rings read as
// fragments rather than targets. Nothing is copied from a photograph: every
// ring is a formula on the face-api 68-point landmarks, so the same pattern
// lands on any face, at any distance from the camera, at any head tilt.
//
// The centres are chosen to sit where a recogniser looks hardest: both eye
// sockets, the mouth, then the cheekbones and the forehead. The eyeballs and
// (optionally) the lips are left uncovered through a clip mask, because that
// is what paint on a real face does.
//
// HOW IT PLUGS INTO THE ENGINE
//
// Only `onDraw(ctx, landmarks)` is implemented. The engine calls it on the
// visible overlay every tick, and `compositeAndDetect()` calls the very same
// function on the offscreen frame that is re-detected, so whatever is painted
// here is exactly what the matcher is scored against.
//
// The controls (two colours, opacity, scale, breakage, a re-seed button) are
// a self-contained panel, built the way brush.js builds its own: mounted in
// the lab's reserved `#gm-pluginbar-mount` when that slot is present and
// visible, otherwise floating at the bottom of the viewport. No lab file
// needs to change.
// ---------------------------------------------------------------------------

const ID = 'circular-fragments';
const G = (typeof window !== 'undefined' && (window.gstmxx || window.Ghostati)) || {};
function log(message) {
   if (typeof G.log === 'function') G.log(message, 'Circular Fragments');
}

// ===========================================================================
// GEOMETRY: WHERE THE DOTS ARE USED
//
// Every number below is in INTER-OCULAR UNITS ("iod"): 1.0 is the distance
// between the two eye centres of the face on screen. A face far from the
// camera has a small iod and gets small rings; a face close to the camera
// gets large ones; the pattern keeps its proportions. Nothing here is in
// pixels.
//
// Directions: +x runs along the line joining the eyes, from the eye that is
// on the LEFT of the frame (face-api points 36-41, "left eye") towards the
// eye on the RIGHT of the frame (points 42-47). +y is perpendicular to that
// line, DOWN the face. Both axes rotate with the head, so a tilted head gets
// a tilted pattern, the way paint does.
//
// The face-api 68 points, for reference:
//    0-16  jaw line, ear to ear through the chin (8 = chin tip)
//   17-21  left brow, 22-26 right brow
//   27-35  nose (27 = bridge top, 30 = tip, 31/35 = nostril wings)
//   36-41  left eye, 42-47 right eye (6 points each, around the lid)
//   48-59  outer lip contour, 60-67 inner lip contour
// ===========================================================================

/**
 * ANCHORS: named points computed from the landmarks each frame. A centre in
 * CENTRES names one of these and adds an offset to it, so a ring follows the
 * feature it belongs to even when the face turns or the mouth opens.
 */
const ANCHOR_INDICES = {
   leftEye: [36, 37, 38, 39, 40, 41],        // centroid of the six lid points
   rightEye: [42, 43, 44, 45, 46, 47],
   mouth: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], // centroid of the outer lip
   noseTip: [30],
   browMid: [21, 22],                         // between the inner brow ends
   chin: [8],
};

/**
 * CENTRES: one entry per system of concentric rings.
 *
 *   anchor  which ANCHOR the rings are centred on
 *   dx, dy  offset from that anchor, in iod (dx: +right, dy: +down)
 *   rings   list of [innerRadius, outerRadius] in iod; each ring is an
 *           annulus (a band between two circles). The gap between one ring's
 *           outer radius and the next ring's inner radius is skin left bare,
 *           which is what makes the rings read as separate bands.
 *   phase   rotation of the whole system, in radians, so the missing
 *           fragments of different centres do not line up
 *   first   0 or 1: which of the two colours the innermost ring takes
 *           (rings alternate colour A, B, A, B, ... outwards)
 *
 * Shapes and distances, as tuned for the default face:
 *   - eye sockets: three rings. The innermost starts at 0.30 iod from the
 *     eye centre, just outside the eye itself (an eye is about 0.35 iod wide,
 *     so its half-width is ~0.17), and the outermost ends at 0.84 iod, which
 *     reaches the brow above and the cheekbone below. These two systems are
 *     the ones to keep if anything is trimmed: the eye region carries most of
 *     the identity signal.
 *   - mouth: two rings from 0.42 iod (outside the lips, which are ~0.6 iod
 *     wide) to 0.76 iod, covering the chin and the nasolabial folds.
 *   - cheeks: rings centred 0.35 iod outside and 0.95 iod below each eye,
 *     i.e. on the cheekbone. The right one includes a filled disc (inner
 *     radius 0) as a focal point, the way painted patterns often have one
 *     "bullseye".
 *   - forehead: rings centred 0.55 iod above the point between the brows.
 *     Mostly clipped by the hairline mask; what remains are arcs across the
 *     brow ridge and the temples.
 *
 * To lean the pattern further towards the eyes and the mouth: add rings to
 * the eye and mouth systems, or reduce the cheek and forehead ones. To move a
 * system, change dx/dy. To make bands thicker, widen [inner, outer].
 */
const CENTRES = [
   { anchor: 'leftEye',  dx: 0.00, dy: 0.00, rings: [[0.30, 0.50], [0.57, 0.74], [0.80, 0.93]], phase: 0.15, first: 0 },
   { anchor: 'rightEye', dx: 0.00, dy: 0.00, rings: [[0.30, 0.48], [0.55, 0.70], [0.76, 0.90]], phase: 0.95, first: 1 },
   { anchor: 'mouth',    dx: 0.00, dy: 0.05, rings: [[0.42, 0.60], [0.67, 0.82]],               phase: 0.40, first: 1 },
   { anchor: 'leftEye',  dx: -0.35, dy: 0.95, rings: [[0.16, 0.34], [0.41, 0.56]],              phase: 1.70, first: 0 },
   { anchor: 'rightEye', dx: 0.35, dy: 0.95, rings: [[0.00, 0.14], [0.21, 0.37], [0.44, 0.58]], phase: 2.30, first: 1 },
   { anchor: 'browMid',  dx: 0.00, dy: -0.55, rings: [[0.24, 0.42], [0.49, 0.64]],              phase: 0.70, first: 0 },
];

/**
 * FRAGMENTATION: how pieces are knocked out of each ring.
 *
 *   SECTORS    every ring is cut into this many equal arcs (6 = 60° each)
 *   BREAKAGE   fraction of those arcs that are NOT painted (0 = full rings,
 *              0.3 = about a third missing). Which arcs go is decided by a
 *              deterministic hash of (seed, centre, ring, sector), so the
 *              pattern is stable from frame to frame and identical on the
 *              visible overlay and on the frame the matcher sees.
 *   TWIST      extra rotation per ring, in radians, so the gaps of adjacent
 *              rings do not align into a spoke
 *   SEAM       small angular gap left bare at both ends of every painted arc,
 *              in radians, so neighbouring fragments show a thin skin line
 *              between them (0 to merge them)
 */
const SECTORS = 6;
const BREAKAGE_DEFAULT = 0.3;
const TWIST = 0.37;
const SEAM = 0.035;

/**
 * MASK: where paint is allowed.
 *
 *   HAIRLINE_LIFT  the mask's top edge is the brow points lifted this many
 *                  iod upwards, an estimate of the hairline (face-api has no
 *                  hairline points). 0.85 reaches a typical hairline; lower it
 *                  for a short forehead.
 *   TEMPLE_LIFT    how far above the jaw's end points (0 and 16, at the ears)
 *                  the mask's side edges rise before joining the hairline
 *   EYE_HOLE       the eyeballs are cut out of the mask: the six lid points
 *                  scaled from the eye centre by this factor. 1.35 leaves the
 *                  lid and a little skin around it bare; 1.0 is the lid edge.
 *   MOUTH_HOLE     same for the outer lip contour; null to paint over the
 *                  lips. The lips are kept bare by default because rings
 *                  around the mouth, not on it, is what the reference looks
 *                  like; set to null to test the harsher variant.
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
   scale: 1.0,          // multiplies every radius in CENTRES
   breakage: BREAKAGE_DEFAULT,
   seed: 7,             // which fragments are missing; "Re-seed" changes it
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

/**
 * The face frame: origin between the eyes, unit = inter-ocular distance,
 * x along the eye line, y down the face. Everything in GEOMETRY is expressed
 * in this frame; `toScreen` maps it back to canvas pixels.
 */
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

/** A point given in iod units, relative to `base` (a canvas point), to canvas pixels. */
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

/**
 * Deterministic pseudo-random number in [0, 1) from integer coordinates.
 * The same inputs always give the same output, which is what keeps the
 * fragments still while the face moves.
 */
function hash01(seed, a, b, c) {
   let h = (seed * 0x9e3779b1) ^ 0x85ebca6b;
   h = Math.imul(h ^ (a + 1000), 0xc2b2ae35);
   h = Math.imul(h ^ (h >>> 15) ^ (b + 1000), 0x27d4eb2f);
   h = Math.imul(h ^ (h >>> 13) ^ (c + 1000), 0x165667b1);
   h ^= h >>> 16;
   return (h >>> 0) / 4294967296;
}

/**
 * Build the clip path: the face polygon (jaw line + estimated hairline) with
 * the eyes and, optionally, the mouth cut out. Uses the even-odd rule, so the
 * inner contours become holes.
 */
function clipToFace(ctx, positions, frame) {
   const jaw = positions.slice(0, 17);
   const brows = positions.slice(17, 27);
   ctx.beginPath();

   // Outer contour: down the left side of the jaw, through the chin, up the
   // right side, then across the estimated hairline from right to left.
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

   // Holes: eyeballs, and lips when MOUTH_HOLE is set.
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

/**
 * Paint one annulus sector: the band between radius r0 and r1, from angle a0
 * to a1, around (cx, cy). Radii are in canvas pixels here (already scaled).
 */
function fillArcBand(ctx, cx, cy, r0, r1, a0, a1) {
   ctx.beginPath();
   ctx.arc(cx, cy, r1, a0, a1, false);
   if (r0 > 0) ctx.arc(cx, cy, r0, a1, a0, true);
   else ctx.lineTo(cx, cy);
   ctx.closePath();
   ctx.fill();
}

export function onDraw(ctx, landmarks) {
   if (!landmarks || !landmarks.positions || landmarks.positions.length < 68) return;
   const positions = landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
   const frame = faceFrame(positions);

   if (ctx.canvas.isConnected) noteFrame(); // the visible overlay, not the offscreen composite

   ctx.save();
   clipToFace(ctx, positions, frame);
   ctx.globalAlpha = settings.alpha;
   const palette = [settings.colorA, settings.colorB];

   // Angles are measured in the face frame: 0 points along +x (towards the
   // right eye), and they rotate with the head because the frame does.
   const tilt = Math.atan2(frame.xhat.y, frame.xhat.x);
   const sectorSpan = (Math.PI * 2) / SECTORS;

   CENTRES.forEach((system, ci) => {
      const base = anchorPoint(system.anchor, positions);
      const c = offset(base, frame, system.dx, system.dy);
      system.rings.forEach(([inner, outer], ri) => {
         const r0 = inner * frame.iod * settings.scale;
         const r1 = outer * frame.iod * settings.scale;
         ctx.fillStyle = palette[(system.first + ri) % 2];
         const rotation = tilt + system.phase + ri * TWIST;
         for (let si = 0; si < SECTORS; si += 1) {
            // The fragment is missing when its hash falls under the breakage
            // fraction. Same seed, same fragments, every frame.
            if (hash01(settings.seed, ci, ri, si) < settings.breakage) continue;
            const a0 = rotation + si * sectorSpan + SEAM;
            const a1 = rotation + (si + 1) * sectorSpan - SEAM;
            fillArcBand(ctx, c.x, c.y, r0, r1, a0, a1);
         }
      });
   });

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
   if (!panel) openPanel(); // safety net when the bus never announced the activation
}

/**
 * Where the panel lives. The lab reserves `#gm-pluginbar-mount` for plugin
 * controls, but it only reveals that bar for Ghostyles it knows by id and
 * has pinned to a rail slot; a plugin it does not know would mount there
 * and stay invisible. So: use the mount when the bar is actually shown,
 * float otherwise, and re-check every second while active, because pinning
 * can change the answer at any time.
 */
function placePanel() {
   if (!panel) return;
   const mount = document.getElementById('gm-pluginbar-mount');
   const bar = document.getElementById('gm-pluginbar');
   const barVisible = Boolean(mount && bar && bar.classList.contains('show'));
   const target = barVisible ? mount : document.body;
   if (panel.parentNode !== target) target.appendChild(panel);
   panel.classList.toggle('gm-cf-floating', !barVisible);
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
      colorA: color('colorA', 'Colour A (odd rings)'),
      colorB: color('colorB', 'Colour B (even rings)'),
      alpha: range('alpha', 0.2, 1, 0.05, 'Opacity'),
      scale: range('scale', 0.6, 1.5, 0.05, 'Ring size'),
      breakage: range('breakage', 0, 0.8, 0.05, 'Missing fragments'),
   };
   const hint = document.createElement('p');
   hint.setAttribute('data-role', 'hint');
   hint.style.cssText = 'flex-basis:100%;margin:2px 0 0;font-size:12px;line-height:1.45;color:var(--muted,#b9a892)';

   panel.append(
      label('Fragments'), inputs.colorA, inputs.colorB,
      label('opacity'), inputs.alpha,
      label('size'), inputs.scale,
      label('breakage'), inputs.breakage,
      button('Re-seed', 'Choose a different set of missing fragments', () => { settings.seed = (settings.seed + 1) % 1000; }),
      button('Reset', 'Back to the default colours and shape', () => {
         Object.assign(settings, DEFAULTS);
         inputs.colorA.value = settings.colorA;
         inputs.colorB.value = settings.colorB;
         inputs.alpha.value = String(settings.alpha);
         inputs.scale.value = String(settings.scale);
         inputs.breakage.value = String(settings.breakage);
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
      ? 'Lost the face; the rings come back with it.'
      : 'No face detected yet. The rings are anchored to facial landmarks, so they need one.';
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

/**
 * onInit fires once per plugin at page load, for every plugin, so it must
 * not build UI (see brush.js for the full argument). The activation signal
 * is `effectChanged` on the shared bus, which may not exist yet when this
 * runs, hence the short retry.
 */
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
   return 'Circular Fragments ready: two colours, rings on eyes, mouth, cheeks and forehead.';
}

export function onClear() {
   closePanel();
}
