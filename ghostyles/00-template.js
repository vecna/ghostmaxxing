/**
 * ==Ghostyle==
 * @name         Template
 * @version      2.0.0
 * @author       vecna
 * @release_date 2026-06-29
 * @description  Template canonico per plugin Ghostmaxxing: esempio minimo con callback 2D + UV.
 * ==/Ghostyle==
 */

// Questo file e' volutamente molto commentato: il suo scopo non e' l'effetto
// visivo, ma mostrare come si costruisce un plugin compatibile col modello
// unificato (onDraw per face-api e paintUV per MediaPipe).

/**
 * Callback 2D chiamata durante il tick face-api.
 *
 * Per un template didattico vogliamo un gesto minimo: un cerchio sottile
 * centrato sul naso. Non usiamo forme complesse per evitare di "sovra-educare"
 * chi copia questo file come base.
 */
export function onDraw(ctx, landmarks) {
  // I landmark del naso sono 9 punti. Il centroide e' la media geometrica
  // dell'area, robusta anche se il volto ruota leggermente.
  const nose = landmarks.getNose();
  const c = Ghostati.avgPoint(nose);

  // Il raggio cresce con la distanza verticale del naso per adattarsi a
  // facce grandi/piccole senza hardcode in pixel assoluti.
  const radius = Math.max(8, Ghostati.distance(nose[0], nose[6]) * 0.18);

  // Disegno volutamente sottile: un template non deve dominare il frame.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(235, 245, 255, 0.85)';
  ctx.stroke();
  ctx.restore();
}

/**
 * Callback UV chiamata durante il tick MediaPipe.
 *
 * Qui mostriamo una banda trasparente nella zona fronte UV. E' utile per
 * capire che paintUV non disegna sul video in pixel-space, ma sulla texture
 * canonica del volto che poi viene warpata triangolo-per-triangolo.
 */
export function paintUV(ctx) {
  // Non e' necessario conoscere i 478 indici per un primo esempio: tracciamo
  // una fascia nella parte alta della texture UV, dove tipicamente ricade
  // la fronte nella mappa canonica.
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Colore leggibile ma trasparente, cosi' si vede bene la sovrapposizione.
  ctx.save();
  ctx.fillStyle = 'rgba(90, 210, 235, 0.22)';

  // Banda orizzontale con margini laterali per evitare il bordo della texture.
  const x = w * 0.18;
  const y = h * 0.08;
  const bw = w * 0.64;
  const bh = h * 0.16;
  ctx.fillRect(x, y, bw, bh);

  // Un bordo leggero aiuta a percepire l'estensione della forma nella UV map.
  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.strokeStyle = 'rgba(225, 250, 255, 0.4)';
  ctx.strokeRect(x, y, bw, bh);
  ctx.restore();
}
