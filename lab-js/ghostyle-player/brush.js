/** @module ghostyle-player/brush
 * Landmark-relative geometry adapted from the Face Brush by vecna (AGPL-3.0-only).
 */
const LEFT_EYE = [36, 37, 38, 39, 40, 41];
const RIGHT_EYE = [42, 43, 44, 45, 46, 47];

/** Returns the center of a set of landmark points. */
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

/** Finds the landmark used to anchor the pointer sample. */
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

/** Reprojects and draws a stored stroke on the current face. */
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

/**
 * Finds the visible camera image inside a centered object-fit: contain layer.
 * @param {DOMRect} bounds On-screen layer.
 * @param {number} width Source width.
 * @param {number} height Source height.
 * @returns {{left:number, top:number, width:number, height:number, scale:number}} Image bounds.
 */
export function containedFrame(bounds, width, height) {
   const scale = Math.min(bounds.width / width, bounds.height / height);
   return {
      left: bounds.left + (bounds.width - width * scale) / 2,
      top: bounds.top + (bounds.height - height * scale) / 2,
      width: width * scale,
      height: height * scale,
      scale,
   };
}

/**
 * Creates the native brush and anchors each pointer sample to face landmarks.
 * @param {HTMLCanvasElement} canvas Dedicated brush layer.
 * @param {object} options Brush control readers and status callbacks.
 * @returns {object} Brush operations for rendering and editing.
 */
export function createBrush(canvas, { settings, unavailable, changed }) {
   const strokes = [];
   let gesture = null;
   let latest = null;

   /** Converts pointer coordinates from the mirrored preview to source pixels. */
   function point(event) {
      const frame = containedFrame(canvas.getBoundingClientRect(), canvas.width, canvas.height);
      const x = (event.clientX - frame.left) / frame.scale;
      const y = (event.clientY - frame.top) / frame.scale;
      if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) return null;
      return { x: canvas.width - x, y };
   }

   /** Commits the active pointer stroke when its gesture ends. */
   function finish(event) {
      if (!gesture || (event && gesture.pointerId !== event.pointerId)) return;
      strokes.push(gesture.stroke);
      gesture = null;
      changed(strokes.length);
   }

   canvas.addEventListener('pointerdown', event => {
      if (gesture || event.button !== 0) return;
      if (!latest) return unavailable();
      const position = point(event);
      if (!position) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const { color, size, opacity } = settings();
      gesture = {
         pointerId: event.pointerId,
         stroke: {
            color,
            alpha: opacity,
            nWidth: size / latest.frame.eyeDist,
            samples: [toLocal(position, latest.positions, latest.frame)],
         },
      };
   });
   canvas.addEventListener('pointermove', event => {
      if (gesture?.pointerId !== event.pointerId || !latest) return;
      const position = point(event);
      if (!position) return;
      const samples = gesture.stroke.samples;
      const previous = toScreen(samples.at(-1), latest.positions, latest.frame);
      if (Math.hypot(position.x - previous.x, position.y - previous.y) >= 2) {
         samples.push(toLocal(position, latest.positions, latest.frame));
      }
   });
   canvas.addEventListener('pointerup', finish);
   canvas.addEventListener('pointercancel', finish);
   canvas.addEventListener('lostpointercapture', finish);

   return {
      /** Redraws all brush strokes over the latest landmarks and clears them when the face leaves. */
      draw(positions) {
         const ctx = canvas.getContext('2d');
         ctx.clearRect(0, 0, canvas.width, canvas.height);
         latest = positions?.length >= 68 ? { positions, frame: eyeFrame(positions) } : null;
         if (!latest) return;
         for (const stroke of strokes) paintStroke(ctx, stroke, positions, latest.frame);
         if (gesture) paintStroke(ctx, gesture.stroke, positions, latest.frame);
      },
      /** Ends an active gesture when Brush is switched off. */
      finish,
      /** Removes the most recent stroke. */
      undo() {
         strokes.pop();
         changed(strokes.length);
      },
      /** Removes the current drawing. */
      clear() {
         gesture = null;
         strokes.length = 0;
         changed(0);
      },
      /** Exports a self-contained Ghostyle draft that can replay the current drawing. */
      toSource() {
         return [
            '/**',
            ' * ==Ghostyle==',
            ' * @name Brush Sketch',
            ' * @slug brush-sketch',
            ' * @version 1.0.0',
            ' * @author Ghostyle Player',
            ' * @license AGPL-3.0-only',
            ' * @description Face-anchored drawing from the Ghostyle Player brush.',
            ' * ==/Ghostyle==',
            ' */',
            'const strokes = ' + JSON.stringify(strokes) + ';',
            'const LEFT_EYE = ' + JSON.stringify(LEFT_EYE) + ';',
            'const RIGHT_EYE = ' + JSON.stringify(RIGHT_EYE) + ';',
            avg, eyeFrame, toScreen, paintStroke,
            'export function onDraw(ctx, landmarks) {',
            '   const positions = landmarks.positions;',
            '   const frame = eyeFrame(positions);',
            '   for (const stroke of strokes) paintStroke(ctx, stroke, positions, frame);',
            '}',
         ].join('\n\n');
      },
   };
}
