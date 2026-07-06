/**
 * ==Ghostyle==
 * @name         CV-Dazzle example 1
 * @version      1.0.0
 * @author       vecna, but actually a dump of random points
 * @release_date 2026-04-13
 * @description  Pattern ad alto contrasto ispirato al CV-Dazzle per rottura simmetrica del volto.
 * ==/Ghostyle==
 */

export function onInit() {
  gstmxx.log('Caricato Ghostyle: CV-Dazzle example 1.', 'CV-Dazzle example 1');
}

/**
 * Applica una composizione ispirata al lavoro CV-Dazzle di Adam Harvey (2010).
 *
 * Strategia adversarial usata qui:
 * 1. Rottura della simmetria bilaterale con diagonali e sbordi extra-volto.
 * 2. Copertura di feature biometriche stabili (ponte nasale, zigomo, contorni occhio).
 * 3. Contrasto alto e alternanza chiaro/scuro per destabilizzare i descrittori locali.
 * 4. Sovrapposizioni opache su regioni semantiche forti che i modelli pesano molto.
 * 5. Etichette e forme "non anatomiche" per indebolire i cue faciali classici.
 */
export function onDraw(ctx, landmarks) {
  const nose = landmarks.getNose();
  const jaw = landmarks.getJawOutline();
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftBrow = landmarks.getLeftEyeBrow();

  const baseMask = [
    gstmxx.lerp(jaw[0], leftBrow[0], 1.2),
    nose[0],
    nose[5],
    jaw[7],
    jaw[4],
    jaw[1],
    jaw[0]
  ];
  gstmxx.drawClosedPath(ctx, baseMask, 'rgba(255, 20, 147, 0.25)', 'rgba(255, 20, 147, 0.45)', 4);

  const taglioCyan = [
    jaw[7],
    nose[6],
    nose[2],
    leftBrow[4],
    gstmxx.lerp(leftBrow[4], jaw[0], -0.6)
  ];
  gstmxx.drawOpenPath(ctx, taglioCyan, 'rgba(0, 255, 255, 0.2)', 16);

  const taglioYellow = [
    jaw[2],
    leftEye[3],
    nose[1],
    rightEye[0],
    gstmxx.lerp(rightEye[0], jaw[15], 0.3)
  ];
  gstmxx.drawOpenPath(ctx, taglioYellow, 'rgba(240, 255, 0, 0.25)', 8);

  const contrastoNero1 = [jaw[5], gstmxx.lerp(jaw[5], nose[4], 0.6), leftEye[0]];
  gstmxx.drawOpenPath(ctx, contrastoNero1, 'rgba(15, 17, 21, 0.25)', 24);

  const contrastoNero2 = [nose[5], nose[3], rightEye[3], gstmxx.lerp(rightEye[3], jaw[14], 0.5)];
  gstmxx.drawOpenPath(ctx, contrastoNero2, 'rgba(15, 17, 21, 0.25)', 18);

  gstmxx.drawEyeWing(ctx, leftEye, leftBrow, 'CV-DAZZLE', {
    scale: 1.8,
    brow: 0.8,
    fill: 'rgba(57, 255, 20, 0.35)',
    stroke: 'rgba(57, 255, 20, 0.35)',
    line: 'rgba(255, 255, 255, 0.2)',
    side: 'left',
    tailX: -45,
    tailY: 20
  });

  gstmxx.drawLabel(ctx, 'SECTOR-01-ANOMALY', nose[4].x - 85, nose[4].y + 35);
}

export function onClear() {
  gstmxx.log('Modulo CV-Dazzle example 1 disattivato.', 'CV-Dazzle example 1');
}
