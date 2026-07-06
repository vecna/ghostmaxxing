/**
 * ==Ghostyle==
 * @name         Beauty Demo 2D
 * @version      1.0.0
 * @author       NINA
 * @release_date 2025-01-01
 * @description  Demo beauty non-adversarial per mostrare helper composti 2D.
 * ==/Ghostyle==
 */

/**
 * Questo effetto non e' adversarial: serve come riferimento didattico per
 * l'uso combinato di drawCheekSweep, drawClosedPath e drawLabel.
 */
export function onDraw(ctx, landmarks) {
  const jaw = landmarks.getJawOutline();
  const mouth = landmarks.getMouth();
  const nose = landmarks.getNose();

  const G = window.gstmxx;

  G.drawCheekSweep(
    ctx,
    jaw[2],
    nose[2],
    mouth[0],
    jaw[4],
    'blush',
    'rgba(255, 138, 176, 0.24)',
    'rgba(255, 187, 208, 0.55)'
  );

  G.drawCheekSweep(
    ctx,
    jaw[14],
    nose[6],
    mouth[6],
    jaw[12],
    'blush',
    'rgba(255, 138, 176, 0.24)',
    'rgba(255, 187, 208, 0.55)'
  );

  const outer = mouth.slice(0, 12);
  const inner = mouth.slice(12);
  const mouthCenter = G.avgPoint(outer);

  G.drawClosedPath(ctx, outer, 'rgba(232, 81, 116, 0.40)', 'rgba(255, 201, 211, 0.70)', 2.1);
  G.drawClosedPath(ctx, inner, 'rgba(255,255,255,0.18)', null, 0);
  G.drawLabel(ctx, 'beauty demo', mouthCenter.x + 14, mouthCenter.y - 14);
}
