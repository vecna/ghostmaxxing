/**
 * ==Ghostyle==
 * @name         Face Brush
 * @slug         brush
 * @version      0.1.0
 * @author       vecna
 * @license      AGPL-3.0-only
 * @release_date 2026-07-04
 * @description  Hold-to-paint brush anchored to face landmarks. Marks track the face and are scored live by the recognition pipeline; bake a promising state into a static Ghostyle.
 * @technique    freehand
 * @supports     2d, params
 * @regions      skin, forehead, cheeks, nose, jaw, brows, eyes, mouth
 * @evidence     experimental
 * ==/Ghostyle==
 */

// ---------------------------------------------------------------------------
// WHY THIS PLUGIN EXISTS
//
// The "aha" moment of Ghostmaxxing is not admiring a pre-made pattern: it is
// drawing something yourself, on your own face, and watching the local
// recognition distance climb in real time until the pipeline stops matching
// you. This plugin turns the cursor into a brush so you can chase that moment
// directly.
//
// HOW IT PLUGS INTO THE EXISTING ENGINE (no engine changes required)
//
//   * We implement only `onDraw(ctx, landmarks)`. The 2D face-api path calls it
//     every render tick on the *visible* overlay, AND `compositeAndDetect()`
//     calls the very same `onDraw` on an offscreen composite that is then
//     re-detected. So whatever we paint is automatically fed back into the
//     matcher. `auto-find-loop.js` already re-runs that composite every ~2s and
//     dispatches `matchStateChanged`, which `bbox-overlay.js` renders as the
//     live `distance` / `obfMinDist` next to the face box. That is the "watch
//     the threshold rise" loop — we don't have to build it.
//
//   * The cursor lives in the overlay's on-screen space; the landmarks handed
//     to `onDraw` live in the overlay's internal pixel space (same space).
//     That coincidence is exactly why a cursor brush belongs in the 2D path
//     rather than the UV/`paintUV` path (which only receives the UV texture and
//     no cursor mapping).
//
// HOW MARKS "TRACK THE FACE"
//
//   Each brush sample is NOT stored as a screen pixel. It is stored relative to
//   the nearest detected landmark, in a similarity frame built from the two eye
//   centres (origin = nearest landmark, axes + scale = inter-ocular vector).
//   Every frame we re-project those samples from the *current* landmarks, so a
//   mark rides the face through translation, in-plane rotation and scale.
//
// PREREQUISITE FOR THE LIVE SCORE
//
//   Save a baseline face first (the app's save/scan button). With no baseline
//   in the local DB there is nothing to measure distance against, so the number
//   won't move even though the paint is applied.
// ---------------------------------------------------------------------------

/** Public API object. Uses the target `window.gstmxx`; falls back defensively. */
const G = (typeof window !== 'undefined' && (window.gstmxx || window.Ghostati)) || {};
function log(msg) {
   if (typeof G.log === 'function') G.log(msg, 'Face Brush');
}

// face-api 68-landmark index groups used to build the stable eye frame.
const LEFT_EYE = [36, 37, 38, 39, 40, 41];
const RIGHT_EYE = [42, 43, 44, 45, 46, 47];

// ------------------------------ module state -------------------------------

/** Committed strokes. Each: { color, alpha, nWidth, samples: [{i,a,b}] }. */
let strokes = [];
/** Stroke currently being drawn, or null. */
let current = null;
/** Whether a pointer is held down and painting. */
let painting = false;

/**
 * Last landmark snapshot seen on the *visible* overlay, used to anchor pointer
 * samples between render ticks. { positions:[{x,y}], frame, t }.
 */
let latest = null;

/** The connected overlay canvas we attached listeners to (guards re-attach). */
let boundCanvas = null;
/** Saved handlers so `onClear` can detach cleanly. */
let handlers = null;
/** The injected floating control panel element. */
let panel = null;

/** Current brush settings (snapshotted per stroke at pointerdown). */
const brush = { color: '#00e5ff', alpha: 0.85, widthPx: 26 };

// ------------------------------ geometry -----------------------------------

function avg(points) {
   let x = 0;
   let y = 0;
   for (const p of points) {
      x += p.x;
      y += p.y;
   }
   return { x: x / points.length, y: y / points.length };
}

/** Build a similarity frame (origin-less): eye centres, unit axes, scale. */
function eyeFrame(positions) {
   const le = avg(LEFT_EYE.map((i) => positions[i]));
   const re = avg(RIGHT_EYE.map((i) => positions[i]));
   const dx = re.x - le.x;
   const dy = re.y - le.y;
   const eyeDist = Math.max(1, Math.hypot(dx, dy));
   const xhat = { x: dx / eyeDist, y: dy / eyeDist };
   const yhat = { x: -xhat.y, y: xhat.x }; // +90°: down the face
   return { le, re, eyeDist, xhat, yhat };
}

function nearestIndex(p, positions) {
   let best = 0;
   let bestD = Infinity;
   for (let i = 0; i < positions.length; i++) {
      const dx = positions[i].x - p.x;
      const dy = positions[i].y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
         bestD = d;
         best = i;
      }
   }
   return best;
}

/** Screen point -> face-relative sample {i,a,b}. */
function toLocal(p, positions, frame) {
   const i = nearestIndex(p, positions);
   const anchor = positions[i];
   const dx = p.x - anchor.x;
   const dy = p.y - anchor.y;
   const a = (dx * frame.xhat.x + dy * frame.xhat.y) / frame.eyeDist;
   const b = (dx * frame.yhat.x + dy * frame.yhat.y) / frame.eyeDist;
   return { i, a, b };
}

/** Face-relative sample -> screen point, using the CURRENT landmarks. */
function toScreen(s, positions, frame) {
   const anchor = positions[s.i];
   const ux = frame.xhat.x * s.a + frame.yhat.x * s.b;
   const uy = frame.xhat.y * s.a + frame.yhat.y * s.b;
   return { x: anchor.x + frame.eyeDist * ux, y: anchor.y + frame.eyeDist * uy };
}

// ------------------------------ rendering ----------------------------------

function paintStroke(ctx, stroke, positions, frame) {
   const pts = stroke.samples.map((s) => toScreen(s, positions, frame));
   if (!pts.length) return;
   const width = Math.max(1, stroke.nWidth * frame.eyeDist);

   ctx.save();
   ctx.globalAlpha = stroke.alpha;
   ctx.strokeStyle = stroke.color;
   ctx.fillStyle = stroke.color;
   ctx.lineWidth = width;
   ctx.lineCap = 'round';
   ctx.lineJoin = 'round';

   if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
   } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
         const mx = (pts[i].x + pts[i + 1].x) / 2;
         const my = (pts[i].y + pts[i + 1].y) / 2;
         ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
   }
   ctx.restore();
}

// ------------------------------ pointer I/O --------------------------------

/** True if the canvas carries a horizontal-flip CSS transform (front camera). */
function isMirrored(canvas) {
   const t = getComputedStyle(canvas).transform;
   if (!t || t === 'none') return false;
   const m = t.match(/matrix\(([^)]+)\)/);
   if (!m) return false;
   return parseFloat(m[1].split(',')[0]) < 0; // matrix component 'a'
}

/** Pointer event -> overlay internal coordinates (mirror-aware). */
function eventToCanvas(e, canvas) {
   const rect = canvas.getBoundingClientRect();
   const sx = canvas.width / rect.width;
   const sy = canvas.height / rect.height;
   let x = (e.clientX - rect.left) * sx;
   const y = (e.clientY - rect.top) * sy;
   if (isMirrored(canvas)) x = canvas.width - x;
   return { x, y };
}

function attach(canvas) {
   canvas.style.pointerEvents = 'auto';
   canvas.style.cursor = 'crosshair';
   canvas.style.touchAction = 'none';

   const onDown = (e) => {
      if (!latest) {
         log('No face detected yet — move into frame before painting.');
         return;
      }
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* non-fatal */ }
      painting = true;
      const p = eventToCanvas(e, canvas);
      current = {
         color: brush.color,
         alpha: brush.alpha,
         nWidth: brush.widthPx / latest.frame.eyeDist, // width in eye-distance units
         samples: [toLocal(p, latest.positions, latest.frame)]
      };
   };

   const onMove = (e) => {
      if (!painting || !current || !latest) return;
      e.preventDefault();
      const p = eventToCanvas(e, canvas);
      // Throttle: only keep samples a couple of pixels apart.
      const prev = toScreen(current.samples[current.samples.length - 1], latest.positions, latest.frame);
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < 2) return;
      current.samples.push(toLocal(p, latest.positions, latest.frame));
   };

   const onUp = (e) => {
      if (!painting) return;
      e.preventDefault();
      if (current && current.samples.length) strokes.push(current);
      current = null;
      painting = false;
      updatePanel();
   };

   canvas.addEventListener('pointerdown', onDown);
   canvas.addEventListener('pointermove', onMove);
   canvas.addEventListener('pointerup', onUp);
   canvas.addEventListener('pointercancel', onUp);
   canvas.addEventListener('pointerleave', onUp);

   boundCanvas = canvas;
   handlers = { onDown, onMove, onUp };
}

function detach() {
   if (boundCanvas && handlers) {
      boundCanvas.removeEventListener('pointerdown', handlers.onDown);
      boundCanvas.removeEventListener('pointermove', handlers.onMove);
      boundCanvas.removeEventListener('pointerup', handlers.onUp);
      boundCanvas.removeEventListener('pointercancel', handlers.onUp);
      boundCanvas.removeEventListener('pointerleave', handlers.onUp);
      boundCanvas.style.pointerEvents = 'none'; // restore app default (#overlay)
      boundCanvas.style.cursor = '';
   }
   boundCanvas = null;
   handlers = null;
   painting = false;
   current = null;
}

// ------------------------------ control panel ------------------------------

function buildPanel() {
   if (panel) return;
   panel = document.createElement('div');
   panel.setAttribute('data-gstmxx-plugin', 'brush');
   panel.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
      'z-index:400', 'display:flex', 'flex-wrap:wrap', 'gap:10px', 'align-items:center',
      'padding:10px 14px', 'border-radius:12px', 'pointer-events:auto',
      'background:rgba(15,17,21,0.86)', 'backdrop-filter:blur(8px)',
      'border:1px solid rgba(255,255,255,0.12)', 'color:#eef2ff',
      'font:13px/1.2 Inter,system-ui,sans-serif', 'box-shadow:0 8px 30px rgba(0,0,0,0.45)',
      'max-width:calc(100vw - 24px)'
   ].join(';');

   const label = (text) => {
      const s = document.createElement('span');
      s.textContent = text;
      s.style.opacity = '0.8';
      return s;
   };

   const color = document.createElement('input');
   color.type = 'color';
   color.value = brush.color;
   color.title = 'Brush colour';
   color.style.cssText = 'width:34px;height:26px;border:none;background:none;cursor:pointer';
   color.oninput = () => { brush.color = color.value; };

   const size = document.createElement('input');
   size.type = 'range';
   size.min = '4'; size.max = '90'; size.step = '1'; size.value = String(brush.widthPx);
   size.title = 'Brush size';
   size.oninput = () => { brush.widthPx = parseFloat(size.value); };

   const opacity = document.createElement('input');
   opacity.type = 'range';
   opacity.min = '0.1'; opacity.max = '1'; opacity.step = '0.05'; opacity.value = String(brush.alpha);
   opacity.title = 'Opacity';
   opacity.oninput = () => { brush.alpha = parseFloat(opacity.value); };

   const btn = (text, title, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = title;
      b.style.cssText = [
         'padding:6px 10px', 'border-radius:8px', 'cursor:pointer',
         'background:rgba(159,122,234,0.22)', 'border:1px solid rgba(159,122,234,0.5)',
         'color:#fff', 'font:600 12px Inter,system-ui,sans-serif'
      ].join(';');
      b.onclick = fn;
      return b;
   };

   const count = document.createElement('span');
   count.setAttribute('data-role', 'count');
   count.style.cssText = 'opacity:0.7;min-width:74px;text-align:right';

   panel.append(
      label('Brush'), color, label('size'), size, label('opacity'), opacity,
      btn('Undo', 'Remove last stroke', () => { strokes.pop(); updatePanel(); }),
      btn('Clear', 'Remove all strokes', () => { strokes = []; updatePanel(); }),
      btn('Copy state', 'Copy the painted state as JSON', copyState),
      btn('Bake Ghostyle', 'Download this state as a standalone .js Ghostyle', bakeGhostyle),
      count
   );
   document.body.appendChild(panel);
   updatePanel();
}

function updatePanel() {
   if (!panel) return;
   const c = panel.querySelector('[data-role="count"]');
   if (c) c.textContent = `${strokes.length} stroke${strokes.length === 1 ? '' : 's'}`;
}

function removePanel() {
   if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
   panel = null;
}

// ------------------------------ export / bake ------------------------------

function stateJson() {
   return JSON.stringify({ format: 'gstmxx-brush', version: 1, strokes }, null, 2);
}

function copyState() {
   const json = stateJson();
   const done = () => log(`Copied ${strokes.length} stroke(s) to the clipboard as JSON.`);
   if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(done).catch(() => fallbackCopy(json));
   } else {
      fallbackCopy(json);
   }
}

function fallbackCopy(text) {
   const ta = document.createElement('textarea');
   ta.value = text;
   ta.style.cssText = 'position:fixed;left:-9999px;top:0';
   document.body.appendChild(ta);
   ta.select();
   try { document.execCommand('copy'); log('Copied painted state as JSON.'); }
   catch { log('Could not access clipboard; state logged to console.'); console.log(text); }
   document.body.removeChild(ta);
}

/**
 * Turn the current painted state into a standalone, dependency-free Ghostyle
 * file and download it. This is the honest "author a Ghostyle" path the
 * roadmap describes: paint live, keep what works, bake it into a reusable
 * static plugin. The generated file replays the same eye-frame re-projection.
 */
function bakeGhostyle() {
   if (!strokes.length) {
      log('Nothing to bake yet — paint at least one stroke first.');
      return;
   }
   const ts = new Date();
   const stamp = ts.toISOString().slice(0, 19).replace(/[:T]/g, '-');
   const slug = `brushed-${stamp}`;
   const data = JSON.stringify(strokes);

   const file = `/**
 * ==Ghostyle==
 * @name         Brushed ${ts.toISOString().slice(0, 10)}
 * @slug         ${slug}
 * @version      1.0.0
 * @author       a random Ghostmaxxer
 * @license      AGPL-3.0-only
 * @release_date ${ts.toISOString().slice(0, 10)}
 * @description  Baked freehand pattern captured live with the Face Brush and anchored to face landmarks.
 * @technique    freehand
 * @supports     2d
 * @regions      skin
 * @evidence     experimental
 * ==/Ghostyle==
 */

// Auto-generated by the Face Brush Ghostyle. Each sample is stored relative to
// the nearest 68-landmark point in an inter-ocular similarity frame, so the
// pattern tracks the face. Fully self-contained: no gstmxx helpers required.

const STROKES = ${data};
const LEFT_EYE = [36,37,38,39,40,41];
const RIGHT_EYE = [42,43,44,45,46,47];

function avg(pts){let x=0,y=0;for(const p of pts){x+=p.x;y+=p.y;}return {x:x/pts.length,y:y/pts.length};}
function frameOf(pos){
  const le=avg(LEFT_EYE.map(i=>pos[i])), re=avg(RIGHT_EYE.map(i=>pos[i]));
  const dx=re.x-le.x, dy=re.y-le.y, eyeDist=Math.max(1,Math.hypot(dx,dy));
  const xhat={x:dx/eyeDist,y:dy/eyeDist}; const yhat={x:-xhat.y,y:xhat.x};
  return {eyeDist,xhat,yhat};
}
function toScreen(s,pos,f){
  const a=pos[s.i]; const ux=f.xhat.x*s.a+f.yhat.x*s.b, uy=f.xhat.y*s.a+f.yhat.y*s.b;
  return {x:a.x+f.eyeDist*ux, y:a.y+f.eyeDist*uy};
}

export function onDraw(ctx, landmarks){
  const pos = landmarks.positions.map(p=>({x:p.x,y:p.y}));
  const f = frameOf(pos);
  for(const st of STROKES){
    const pts = st.samples.map(s=>toScreen(s,pos,f));
    if(!pts.length) continue;
    const w = Math.max(1, st.nWidth*f.eyeDist);
    ctx.save();
    ctx.globalAlpha=st.alpha; ctx.strokeStyle=st.color; ctx.fillStyle=st.color;
    ctx.lineWidth=w; ctx.lineCap='round'; ctx.lineJoin='round';
    if(pts.length===1){ctx.beginPath();ctx.arc(pts[0].x,pts[0].y,w/2,0,Math.PI*2);ctx.fill();}
    else{
      ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
      for(let i=1;i<pts.length-1;i++){const mx=(pts[i].x+pts[i+1].x)/2,my=(pts[i].y+pts[i+1].y)/2;ctx.quadraticCurveTo(pts[i].x,pts[i].y,mx,my);}
      const last=pts[pts.length-1]; ctx.lineTo(last.x,last.y); ctx.stroke();
    }
    ctx.restore();
  }
}
`;

   const blob = new Blob([file], { type: 'text/javascript' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `${slug}.js`;
   document.body.appendChild(a);
   a.click();
   document.body.removeChild(a);
   setTimeout(() => URL.revokeObjectURL(url), 1000);
   log(`Baked ${strokes.length} stroke(s) into ${slug}.js — drop it in ghostyles/ and add it to ghostyles.json.`);
}

// ------------------------------ plugin hooks -------------------------------

export function onInit() {
   return 'Face Brush ready — save a baseline, then hold and paint to watch the distance climb.';
}

/**
 * Called every render tick on the visible overlay, and also on the offscreen
 * composite that gets re-detected. We (a) cache the latest live landmarks so
 * pointer samples can be anchored between ticks, (b) lazily wire up input +
 * the control panel the first time we see the real (connected) overlay, and
 * (c) redraw every stroke from the current landmarks.
 */
export function onDraw(ctx, landmarks) {
   if (!landmarks || !landmarks.positions) return;
   const positions = landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
   const frame = eyeFrame(positions);
   const connected = ctx.canvas.isConnected; // visible overlay vs offscreen composite

   if (connected) {
      latest = { positions, frame, t: Date.now() };
      if (boundCanvas !== ctx.canvas) {
         if (boundCanvas) detach();
         attach(ctx.canvas);
         buildPanel();
      }
   }

   for (const st of strokes) paintStroke(ctx, st, positions, frame);
   if (current) paintStroke(ctx, current, positions, frame);
}

/** Called when the effect is switched off. Tear down input + panel; keep strokes. */
export function onClear() {
   detach();
   removePanel();
   latest = null;
}
