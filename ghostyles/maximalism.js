/**
 * ==Ghostyle==
 * @name         Maximalism
 * @version      1.0.0
 * @author       vecna
 * @release_date 2026-06-29
 * @description  Pattern massimalista ispirato a trucchi club/drag contemporanei. Spezza la simmetria, ridisegna la bocca, copre lo zigomo, estende l'occhio verso l'alto.
 * ==/Ghostyle==
 */

function drawEyeshadow(ctx, eye, brow, side) {
  // Dettaglio replicato: ombretto verde acqua esteso oltre il sopracciglio,
  // con salita verticale ampia. Proprietà adversarial: rompe i contorni naturali
  // dell'occhio creando una regione cromatica "non anatomica" ad alto volume.
  const top = brow.map((b, i) => {
    const ref = eye[Math.min(i + 1, eye.length - 1)] || eye[eye.length - 1];
    return Ghostati.lerp(ref, b, 1.8);
  });
  const lower = [eye[3], eye[4], eye[5], eye[0], eye[1], eye[2]];
  const shape = side === 'left' ? [...top, ...lower] : [...top, ...lower.reverse()];
  Ghostati.drawClosedPath(ctx, shape, 'rgba(100, 220, 200, 0.70)', 'rgba(160, 255, 240, 0.70)', 2.2);
}

function drawDownwardEyeliner(ctx, eye, side) {
  // Dettaglio replicato: eyeliner nero spesso con coda "a lacrima" verso il basso.
  // Proprietà adversarial: orientamento opposto al cat-eye classico, introduce
  // asimmetria direzionale e altera i cue geometrici perioculari.
  const upper = [eye[0], eye[1], eye[2], eye[3]];
  const edge = side === 'left' ? eye[0] : eye[3];
  const inner = side === 'left' ? eye[1] : eye[2];

  const ext1 = Ghostati.lerp(inner, edge, 1.5);
  const ext2 = Ghostati.lerp(inner, edge, 2.2);
  ext1.y += 9;
  ext2.y += 14;

  const path = side === 'left' ? [ext2, ext1, ...upper] : [...upper, ext1, ext2];
  Ghostati.drawOpenPath(ctx, path, 'rgba(0, 0, 0, 0.95)', 4.2);
}

function drawFlowerMouth(ctx, mouth) {
  // Dettaglio replicato: bocca ridisegnata a petali, ignorando la forma anatomica.
  // Proprietà adversarial: occlude i bordi labiali reali, che sono feature
  // biometriche altamente informative nei descrittori facciali.
  const c = Ghostati.avgPoint(mouth);
  const petals = 5;
  const baseR = Ghostati.distance(mouth[0], mouth[6]) * 0.22;

  ctx.save();
  ctx.fillStyle = 'rgba(180, 40, 110, 0.85)';
  for (let i = 0; i < petals; i++) {
    const a = (Math.PI * 2 * i) / petals;
    const ox = Math.cos(a) * baseR * 0.9;
    const oy = Math.sin(a) * baseR * 0.7;
    ctx.beginPath();
    ctx.ellipse(c.x + ox, c.y + oy, baseR * 0.95, baseR * 0.55, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function onDraw(ctx, landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();
  const mouth = landmarks.getMouth();

  drawEyeshadow(ctx, leftEye, leftBrow, 'left');
  drawEyeshadow(ctx, rightEye, rightBrow, 'right');

  drawDownwardEyeliner(ctx, leftEye, 'left');
  drawDownwardEyeliner(ctx, rightEye, 'right');

  drawFlowerMouth(ctx, mouth);
}

export function paintUV(ctx) {
  const landmarks3d = Ghostati.lastLandmarks3d;
  if (!Array.isArray(landmarks3d) || landmarks3d.length < 331) return;

  // Dettaglio replicato: blush magenta molto esteso e basso (sotto l'occhio).
  // Proprietà adversarial: copre area zigomatica/nasale con gradiente forte,
  // riducendo stabilità di texture locali nelle regioni guancia.
  const leftRange = landmarks3d.slice(50, 102);
  const rightRange = landmarks3d.slice(280, 331);
  if (!leftRange.length || !rightRange.length) return;

  const left = Ghostati.avgPoint(leftRange);
  const right = Ghostati.avgPoint(rightRange);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  const blush = (p, stretch) => {
    const x = p.x * w;
    const y = p.y * h;
    const r = w * 0.17 * stretch;
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, 'rgba(230, 100, 180, 0.70)');
    g.addColorStop(1, 'rgba(230, 100, 180, 0.02)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.15, r * 0.88, 0.2, 0, Math.PI * 2);
    ctx.fill();
  };

  blush(left, 1.0);
  blush(right, 1.05);
}
