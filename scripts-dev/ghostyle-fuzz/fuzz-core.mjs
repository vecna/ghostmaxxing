/**
 * @module ghostyle-fuzz/fuzz-core
 * @description
 * Pure helpers for scripts-dev/ghostyle-fuzz.cjs. No DOM, no models: this file
 * is imported by the harness page (harness.js), by the Node CLI (dynamic
 * import) and by the unit tests, so every number the fuzzer reports can be
 * re-derived from the same code.
 *
 * Contents: seeded RNG, colour science (sRGB -> CIELAB, CIEDE2000, xterm-256
 * pool, contrast palette), polygon geometry, MediaPipe landmark sets, pose and
 * metric scale, anchor-to-UV baking, trial drawing, distances and scores, the
 * Ghostyle source generator and recipe validation.
 *
 * Documentation: tutorials/ghostyle-fuzz.md.
 */

export const CORE_VERSION = '1.1.0';

/** face-api identity threshold: dlib's LFW default, as in realtime.js and the video loader. */
export const MATCH_THRESHOLD = 0.6;

/** Mean horizontal visible iris diameter of adults, in cm (≈ 11.7 mm, low spread). */
export const IRIS_DIAMETER_CM = 1.17;

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/**
 * mulberry32: a 32-bit seeded PRNG. Small, fast and good enough for drawing
 * shapes; the point is repeatability, not cryptography.
 *
 * @param {number} seed Unsigned 32-bit integer.
 * @returns {function(): number} Uniform floats in [0, 1).
 */
export function mulberry32(seed) {
   let a = seed >>> 0;
   return function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
   };
}

/** Seed of the k-th trial of a run started with master seed S. */
export function trialSeed(masterSeed, k) {
   return (masterSeed + k) >>> 0;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function srgbChannelToLinear(c) {
   const v = c / 255;
   return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * sRGB (0-255) to CIELAB, D65 white. L* is perceived lightness (0 black,
 * 100 white): what survives a conversion to grey.
 *
 * @param {number[]} rgb [r, g, b]
 * @returns {number[]} [L, a, b]
 */
export function rgbToLab([r, g, b]) {
   const R = srgbChannelToLinear(r);
   const G = srgbChannelToLinear(g);
   const B = srgbChannelToLinear(b);
   const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
   const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.0;
   const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
   const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
   const fx = f(X);
   const fy = f(Y);
   const fz = f(Z);
   return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function rgbToHex([r, g, b]) {
   return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * CIEDE2000 colour difference (Sharma, Wu, Dalal 2005). About 1 = just
 * noticeable, 20+ = clearly different colours.
 *
 * @param {number[]} lab1 [L, a, b]
 * @param {number[]} lab2 [L, a, b]
 * @returns {number} ΔE00
 */
export function deltaE2000(lab1, lab2) {
   const [L1, a1, b1] = lab1;
   const [L2, a2, b2] = lab2;
   const rad = Math.PI / 180;
   const C1 = Math.hypot(a1, b1);
   const C2 = Math.hypot(a2, b2);
   const Cbar = (C1 + C2) / 2;
   const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
   const a1p = (1 + G) * a1;
   const a2p = (1 + G) * a2;
   const C1p = Math.hypot(a1p, b1);
   const C2p = Math.hypot(a2p, b2);
   const hp = (a, b) => {
      if (a === 0 && b === 0) return 0;
      const h = Math.atan2(b, a) / rad;
      return h >= 0 ? h : h + 360;
   };
   const h1p = hp(a1p, b1);
   const h2p = hp(a2p, b2);
   const dLp = L2 - L1;
   const dCp = C2p - C1p;
   let dhp = 0;
   if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
   }
   const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
   const Lbarp = (L1 + L2) / 2;
   const Cbarp = (C1p + C2p) / 2;
   let hbarp = h1p + h2p;
   if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
      else hbarp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
   }
   const T = 1
      - 0.17 * Math.cos((hbarp - 30) * rad)
      + 0.24 * Math.cos(2 * hbarp * rad)
      + 0.32 * Math.cos((3 * hbarp + 6) * rad)
      - 0.20 * Math.cos((4 * hbarp - 63) * rad);
   const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
   const RC = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
   const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
   const SC = 1 + 0.045 * Cbarp;
   const SH = 1 + 0.015 * Cbarp * T;
   const RT = -Math.sin(2 * dTheta * rad) * RC;
   return Math.sqrt(
      (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH),
   );
}

/**
 * The xterm-256 palette pool, indices 16-255: the 6×6×6 colour cube and the
 * 24-step grey ramp. 0-15 are left out because terminals render them each
 * their own way, so they are not a standard.
 *
 * @returns {{xterm: number, rgb: number[], hex: string, lab: number[]}[]}
 */
export function xterm256Pool() {
   const levels = [0, 95, 135, 175, 215, 255];
   const pool = [];
   for (let i = 16; i <= 231; i += 1) {
      const n = i - 16;
      const rgb = [levels[Math.floor(n / 36)], levels[Math.floor(n / 6) % 6], levels[n % 6]];
      pool.push({ xterm: i, rgb, hex: rgbToHex(rgb), lab: rgbToLab(rgb) });
   }
   for (let i = 232; i <= 255; i += 1) {
      const v = 8 + (i - 232) * 10;
      const rgb = [v, v, v];
      pool.push({ xterm: i, rgb, hex: rgbToHex(rgb), lab: rgbToLab(rgb) });
   }
   return pool;
}

/** Value at quantile q (0-1) of a numeric array, nearest-rank on the sorted copy. */
export function quantile(values, q) {
   if (!values.length) return null;
   const sorted = [...values].sort((a, b) => a - b);
   const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
   return sorted[index];
}

export function median(values) {
   if (!values.length) return null;
   const sorted = [...values].sort((a, b) => a - b);
   const mid = Math.floor(sorted.length / 2);
   return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Skin swatch from skin pixels: per-channel median in CIELAB, plus the
 * 10th-90th percentile of L* as a measure of uneven lighting.
 *
 * @param {number[][]} labPixels Array of [L, a, b].
 * @returns {{lab: number[], rgbApprox: null, lRange: number[], pixels: number}}
 */
export function skinSwatchFromLab(labPixels) {
   const L = labPixels.map((p) => p[0]);
   const A = labPixels.map((p) => p[1]);
   const B = labPixels.map((p) => p[2]);
   return {
      lab: [median(L), median(A), median(B)].map((v) => round(v, 2)),
      lRange: [round(quantile(L, 0.1), 2), round(quantile(L, 0.9), 2)],
      pixels: labPixels.length,
   };
}

/**
 * Contrast of a pool colour against the skin swatch.
 *
 * @param {number[]} lab Colour in CIELAB.
 * @param {number[]} skinLab Skin swatch in CIELAB.
 * @param {'luminance'|'perceptual'} mode luminance: |ΔL*|, perceptual: ΔE00.
 */
export function contrastAgainstSkin(lab, skinLab, mode) {
   return mode === 'perceptual' ? deltaE2000(lab, skinLab) : Math.abs(lab[0] - skinLab[0]);
}

/**
 * Draw the contrast palette of one trial.
 *
 * 1. Score the pool by contrast with the skin.
 * 2. Keep candidates at or above the `quantile` of those scores.
 * 3. Draw `size` distinct candidates; reject a draw if two colours are closer
 *    than minPairDeltaE (otherwise, on light skin, four near-blacks).
 * 4. After 200 failed draws, lower minPairDeltaE by 5 and go on.
 *
 * @param {function(): number} rng
 * @param {number[]} skinLab
 * @param {{size: number, contrast: string, quantile: number, minPairDeltaE: number}} spec
 * @param {object[]} [pool]
 */
export function drawPalette(rng, skinLab, spec, pool = xterm256Pool()) {
   const scored = pool.map((entry) => ({ ...entry, contrast: contrastAgainstSkin(entry.lab, skinLab, spec.contrast) }));
   const threshold = quantile(scored.map((entry) => entry.contrast), spec.quantile);
   const candidates = scored.filter((entry) => entry.contrast >= threshold);
   const size = Math.min(spec.size, candidates.length);
   let minPair = spec.minPairDeltaE;
   for (;;) {
      for (let attempt = 0; attempt < 200; attempt += 1) {
         const bag = candidates.slice();
         const picked = [];
         for (let i = 0; i < size; i += 1) {
            const index = Math.floor(rng() * bag.length);
            picked.push(bag.splice(index, 1)[0]);
         }
         let ok = true;
         for (let i = 0; i < picked.length && ok; i += 1) {
            for (let j = i + 1; j < picked.length; j += 1) {
               if (deltaE2000(picked[i].lab, picked[j].lab) < minPair) { ok = false; break; }
            }
         }
         if (ok) {
            return {
               colours: picked.map((entry) => ({
                  xterm: entry.xterm,
                  hex: entry.hex,
                  rgb: entry.rgb,
                  lab: entry.lab.map((v) => round(v, 2)),
                  deltaL: round(Math.abs(entry.lab[0] - skinLab[0]), 2),
                  deltaE: round(deltaE2000(entry.lab, skinLab), 2),
               })),
               contrastThreshold: round(threshold, 2),
               candidates: candidates.length,
               usedMinPairDeltaE: minPair,
            };
         }
      }
      if (minPair <= 0) throw new Error('drawPalette: no palette found even with minPairDeltaE 0');
      minPair = Math.max(0, minPair - 5);
   }
}

/** The 148 CSS named colours (CSS Color Module Level 4), lower case, as 24-bit integers. */
const CSS_NAMED_COLOURS = Object.fromEntries(`aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc
bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0
chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b
darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b
darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b
darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969
dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc
ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4
indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd
lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3
lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899
lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000
mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee
mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1
moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500
orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9
peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1
saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb
slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080
thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32`
   .split(/\s+/).map((pair) => { const [name, hex] = pair.split(':'); return [name, parseInt(hex, 16)]; }));

/**
 * Parse a CSS colour: a named colour, #rgb, #rrggbb, or rgb(r, g, b) with
 * 0-255 components. Alpha is not accepted: opacity belongs to the recipe.
 *
 * @param {string} text
 * @returns {number[]} [r, g, b]
 */
export function parseCssColour(text) {
   const s = String(text ?? '').trim().toLowerCase();
   let m;
   if ((m = /^#([0-9a-f]{3})$/.exec(s))) return [...m[1]].map((c) => parseInt(c + c, 16));
   if ((m = /^#([0-9a-f]{6})$/.exec(s))) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
   if ((m = /^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/.exec(s))) {
      const rgb = [m[1], m[2], m[3]].map(Number);
      if (rgb.some((v) => v > 255)) throw new Error(`colour "${text}": rgb() components must be 0-255`);
      return rgb;
   }
   if (s in CSS_NAMED_COLOURS) { const n = CSS_NAMED_COLOURS[s]; return [n >> 16, (n >> 8) & 255, n & 255]; }
   throw new Error(`colour "${text}" is not a CSS named colour, #rgb, #rrggbb or rgb(r, g, b)`);
}

/**
 * The one-colour "palette" of a forced colour (recipe.color / --color), in
 * the same shape as drawPalette's result so every consumer is unchanged.
 * Consumes no randomness.
 */
export function fixedPalette(colourText, skinLab) {
   const rgb = parseCssColour(colourText);
   const lab = rgbToLab(rgb);
   return {
      colours: [{
         xterm: null, hex: rgbToHex(rgb), rgb, lab: lab.map((v) => round(v, 2)),
         deltaL: round(Math.abs(lab[0] - skinLab[0]), 2), deltaE: round(deltaE2000(lab, skinLab), 2),
      }],
      contrastThreshold: null, candidates: 1, usedMinPairDeltaE: null, forced: String(colourText),
   };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function round(value, digits = 3) {
   if (value === null || value === undefined || !Number.isFinite(value)) return value;
   const f = 10 ** digits;
   return Math.round(value * f) / f;
}

export function dist2d(a, b) {
   return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Signed area (positive = counter-clockwise in a y-up frame, clockwise on screen). */
export function signedArea(poly) {
   let s = 0;
   for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      s += p.x * q.y - q.x * p.y;
   }
   return s / 2;
}

export function polygonArea(poly) {
   return Math.abs(signedArea(poly));
}

/** Convex hull (Andrew's monotone chain). */
export function convexHull(points) {
   const pts = points.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => (a.x - b.x) || (a.y - b.y));
   if (pts.length < 3) return pts;
   const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
   const lower = [];
   for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
   }
   const upper = [];
   for (let i = pts.length - 1; i >= 0; i -= 1) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
   }
   upper.pop();
   lower.pop();
   return lower.concat(upper);
}

export function pointInPolygon(point, poly) {
   let inside = false;
   for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const a = poly[i];
      const b = poly[j];
      if ((a.y > point.y) !== (b.y > point.y)
         && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
   }
   return inside;
}

/**
 * Sutherland-Hodgman: clip any polygon against a convex polygon.
 *
 * @param {{x,y}[]} subject
 * @param {{x,y}[]} clip Convex.
 * @returns {{x,y}[]} The part of subject inside clip (may be empty).
 */
export function clipToConvex(subject, clip) {
   const orientation = Math.sign(signedArea(clip)) || 1;
   const inside = (p, a, b) => orientation * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
   const intersect = (p, q, a, b) => {
      const d = (p.x - q.x) * (a.y - b.y) - (p.y - q.y) * (a.x - b.x);
      if (Math.abs(d) < 1e-12) return { x: q.x, y: q.y };
      const t = ((p.x - a.x) * (a.y - b.y) - (p.y - a.y) * (a.x - b.x)) / d;
      return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
   };
   let output = subject.slice();
   for (let i = 0; i < clip.length && output.length; i += 1) {
      const a = clip[i];
      const b = clip[(i + 1) % clip.length];
      const input = output;
      output = [];
      for (let j = 0; j < input.length; j += 1) {
         const current = input[j];
         const previous = input[(j + input.length - 1) % input.length];
         const currentIn = inside(current, a, b);
         const previousIn = inside(previous, a, b);
         if (currentIn) {
            if (!previousIn) output.push(intersect(previous, current, a, b));
            output.push(current);
         } else if (previousIn) {
            output.push(intersect(previous, current, a, b));
         }
      }
   }
   return output;
}

/** Insert points so that no edge is longer than `step`. */
export function densify(poly, step) {
   const out = [];
   for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.ceil(dist2d(a, b) / step));
      for (let k = 0; k < n; k += 1) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
   }
   return out;
}

/** A w×h rectangle centred on c, rotated by angleDeg (screen coordinates). */
export function rotatedRect(c, length, width, angleDeg) {
   const t = (angleDeg * Math.PI) / 180;
   const ux = { x: Math.cos(t), y: Math.sin(t) };
   const uy = { x: -Math.sin(t), y: Math.cos(t) };
   const hl = length / 2;
   const hw = width / 2;
   return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({
      x: c.x + sx * hl * ux.x + sy * hw * uy.x,
      y: c.y + sx * hl * ux.y + sy * hw * uy.y,
   }));
}

/**
 * Do two convex polygons overlap (share interior area)? Separating axis
 * theorem: they are disjoint iff some edge normal of either separates them.
 * Touching along an edge or at a corner does not count as overlap.
 *
 * @param {{x,y}[]} a Convex.
 * @param {{x,y}[]} b Convex.
 */
export function convexPolygonsOverlap(a, b) {
   if (a.length < 3 || b.length < 3) return false;
   const axes = [];
   for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i += 1) {
         const p = poly[i];
         const q = poly[(i + 1) % poly.length];
         const len = Math.hypot(q.y - p.y, q.x - p.x);
         if (len > 1e-12) axes.push({ x: -(q.y - p.y) / len, y: (q.x - p.x) / len });
      }
   }
   for (const axis of axes) {
      const project = (poly) => {
         let lo = Infinity; let hi = -Infinity;
         for (const p of poly) { const v = p.x * axis.x + p.y * axis.y; if (v < lo) lo = v; if (v > hi) hi = v; }
         return [lo, hi];
      };
      const [a0, a1] = project(a);
      const [b0, b1] = project(b);
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
   }
   return true;
}

/** Face zones a stroke centre can be restricted to (recipe.zones / --zones), top to bottom. */
export const ZONES = ['forehead', 'eyes', 'nose-cheeks', 'mouth-chin'];

/**
 * Zone of every stroke-centre candidate on a face, from the anchor mesh:
 * four horizontal bands cut at the brow line (mean of landmarks 70 and 300),
 * halfway between the eye line (33, 263) and the subnasale (2), and the mouth
 * centre (13, 14). Image y grows downwards; a rolled anchor shifts the bands
 * a little, which is accepted: the anchor is the most frontal frame.
 *
 * @param {{x,y}[]} meshPx
 * @returns {string[]} Zone name per mesh index (0 .. STROKE_CENTRE_COUNT-1).
 */
export function zonesOfMesh(meshPx) {
   const y = (i) => meshPx[i].y;
   const brow = (y(70) + y(300)) / 2;
   const eyeNose = ((y(33) + y(263)) / 2 + y(2)) / 2;
   const mouth = (y(13) + y(14)) / 2;
   const out = [];
   for (let i = 0; i < STROKE_CENTRE_COUNT; i += 1) {
      const v = y(i);
      out.push(v < brow ? 'forehead' : v < eyeNose ? 'eyes' : v < mouth ? 'nose-cheeks' : 'mouth-chin');
   }
   return out;
}

// ---------------------------------------------------------------------------
// MediaPipe landmark sets (478-point FaceLandmarker topology)
// ---------------------------------------------------------------------------

/** Indices, matching tasks-vision FACE_LANDMARKS_* contours. "left"/"right" are the subject's. */
export const LANDMARK_SETS = {
   faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
   leftEye: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
   rightEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
   leftBrow: [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
   rightBrow: [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
   lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
   nose: [168, 6, 197, 195, 5, 4, 1, 2, 98, 327, 129, 358, 49, 279, 64, 294, 102, 331, 193, 417, 122, 351],
   rightIris: [468, 469, 470, 471, 472],
   leftIris: [473, 474, 475, 476, 477],
};

/** Number of mesh points that may host a stroke centre: 0-467, iris points excluded. */
export const STROKE_CENTRE_COUNT = 468;

/** Landmarks in pixels: MediaPipe gives x, y as fractions of width and height, z on the x scale. */
export function meshToPx(mesh, width, height) {
   return mesh.map(([x, y, z]) => ({ x: x * width, y: y * height, z: z * width }));
}

export function hullOf(meshPx, indices) {
   return convexHull(indices.map((i) => meshPx[i]));
}

/** The named region hulls of one face, in the mesh's pixel space. */
export function regionHulls(meshPx) {
   return {
      faceOval: hullOf(meshPx, LANDMARK_SETS.faceOval),
      eyes: [hullOf(meshPx, LANDMARK_SETS.leftEye), hullOf(meshPx, LANDMARK_SETS.rightEye)],
      brows: [hullOf(meshPx, LANDMARK_SETS.leftBrow), hullOf(meshPx, LANDMARK_SETS.rightBrow)],
      lips: [hullOf(meshPx, LANDMARK_SETS.lips)],
      nose: [hullOf(meshPx, LANDMARK_SETS.nose)],
   };
}

/**
 * Metric scale from the irises. Per eye the diameter is the larger of the
 * horizontal and vertical contour spans (the vertical one is not shortened by
 * a head turn); the two eyes are averaged.
 *
 * @returns {{irisPx: number, pxPerCm: number, ipdCm: number}}
 */
export function irisScale(meshPx) {
   const eye = (c) => Math.max(dist2d(meshPx[c + 1], meshPx[c + 3]), dist2d(meshPx[c + 2], meshPx[c + 4]));
   const irisPx = (eye(468) + eye(473)) / 2;
   const pxPerCm = irisPx / IRIS_DIAMETER_CM;
   return { irisPx: round(irisPx, 2), pxPerCm: round(pxPerCm, 3), ipdCm: round(dist2d(meshPx[468], meshPx[473]) / pxPerCm, 2) };
}

/**
 * Head pose from MediaPipe's facial transformation matrix (canonical face ->
 * camera, metric). The layout of `data` is detected from where the
 * translation sits (the face is tens of cm in front of the camera, so the
 * z translation is the largest term). Euler order Z·Y·X.
 *
 * Sign conventions (fixed against tests/fixtures/my-moving-face.mp4, see
 * tutorials/ghostyle-fuzz.md): yaw > 0 when the nose points to the image's
 * right; pitch > 0 when the chin goes up; roll > 0 when the head tilts
 * clockwise on screen.
 *
 * @param {number[]} data 16 numbers.
 * @returns {{yaw: number, pitch: number, roll: number}} Degrees.
 */
export function poseFromMatrix(data) {
   const columnMajor = Math.abs(data[14]) >= Math.abs(data[11]);
   const R = (i, j) => (columnMajor ? data[j * 4 + i] : data[i * 4 + j]);
   const deg = 180 / Math.PI;
   const yaw = Math.asin(Math.max(-1, Math.min(1, -R(2, 0)))) * deg;
   const pitch = Math.atan2(R(2, 1), R(2, 2)) * deg;
   const roll = Math.atan2(R(1, 0), R(0, 0)) * deg;
   return { yaw: round(POSE_SIGN.yaw * yaw, 2), pitch: round(POSE_SIGN.pitch * pitch, 2), roll: round(POSE_SIGN.roll * roll, 2) };
}

/** Calibrated signs, see poseFromMatrix. */
export const POSE_SIGN = { yaw: 1, pitch: -1, roll: -1 };

export function poseBin(pose, binDeg) {
   return [Math.floor(pose.yaw / binDeg), Math.floor(pose.pitch / binDeg)];
}

export function poseNorm(pose) {
   return Math.sqrt(pose.yaw ** 2 + pose.pitch ** 2 + pose.roll ** 2);
}

/**
 * Variance of the 4-neighbour Laplacian of a grey image: the usual focus
 * measure. Higher = sharper.
 *
 * @param {Float32Array|number[]} grey Row-major luminance.
 */
export function laplacianVariance(grey, width, height) {
   let sum = 0;
   let sumSq = 0;
   let n = 0;
   for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
         const i = y * width + x;
         const v = grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width] - 4 * grey[i];
         sum += v;
         sumSq += v * v;
         n += 1;
      }
   }
   if (!n) return 0;
   const mean = sum / n;
   return sumSq / n - mean * mean;
}

// ---------------------------------------------------------------------------
// Anchor image space -> canonical UV
// ---------------------------------------------------------------------------

function barycentric(p, a, b, c) {
   const v0x = b.x - a.x; const v0y = b.y - a.y;
   const v1x = c.x - a.x; const v1y = c.y - a.y;
   const v2x = p.x - a.x; const v2y = p.y - a.y;
   const den = v0x * v1y - v1x * v0y;
   if (Math.abs(den) < 1e-12) return null;
   const v = (v2x * v1y - v1x * v2y) / den;
   const w = (v0x * v2y - v2x * v0y) / den;
   return [1 - v - w, v, w];
}

/**
 * Map a point of the anchor frame to the canonical UV texture.
 *
 * The point is located in a mesh triangle and carried by its barycentric
 * coordinates. Where triangles overlap on screen (nose wings), the one
 * closest to the camera wins (MediaPipe: smaller z = closer). A point outside
 * every triangle is snapped to the nearest one.
 *
 * @returns {{uv: number[], inside: boolean}}
 */
export function anchorPointToUv(p, meshPx, triangles, uv) {
   let best = null;
   let bestZ = Infinity;
   for (const t of triangles) {
      const a = meshPx[t[0]]; const b = meshPx[t[1]]; const c = meshPx[t[2]];
      const w = barycentric(p, a, b, c);
      if (!w || w[0] < -1e-9 || w[1] < -1e-9 || w[2] < -1e-9) continue;
      const z = w[0] * a.z + w[1] * b.z + w[2] * c.z;
      if (z < bestZ) { bestZ = z; best = { t, w }; }
   }
   let inside = true;
   if (!best) {
      inside = false;
      let bestD = Infinity;
      for (const t of triangles) {
         const a = meshPx[t[0]]; const b = meshPx[t[1]]; const c = meshPx[t[2]];
         const w0 = barycentric(p, a, b, c);
         if (!w0) continue;
         const clamped = w0.map((v) => Math.max(0, v));
         const s = clamped[0] + clamped[1] + clamped[2];
         const w = clamped.map((v) => v / s);
         const q = { x: w[0] * a.x + w[1] * b.x + w[2] * c.x, y: w[0] * a.y + w[1] * b.y + w[2] * c.y };
         const d = dist2d(p, q);
         if (d < bestD) { bestD = d; best = { t, w }; }
      }
   }
   const [i, j, k] = best.t;
   const u = best.w[0] * uv[i][0] + best.w[1] * uv[j][0] + best.w[2] * uv[k][0];
   const v = best.w[0] * uv[i][1] + best.w[1] * uv[j][1] + best.w[2] * uv[k][1];
   return { uv: [round(u, 5), round(v, 5)], inside };
}

// ---------------------------------------------------------------------------
// Trials
// ---------------------------------------------------------------------------

/**
 * Sample a polygon set on a regular grid. Used for coverage (share of the
 * face oval painted) and for which regions a stroke crosses.
 */
function gridSamples(poly, step) {
   const xs = poly.map((p) => p.x);
   const ys = poly.map((p) => p.y);
   const out = [];
   for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
         const p = { x, y };
         if (pointInPolygon(p, poly)) out.push(p);
      }
   }
   return out;
}

/** Attempts before a constrained placement (zones, no overlap) gives up. */
export const PLACEMENT_ATTEMPTS = 1000;

/**
 * Draw the strokes of one trial on the anchor frame and bake them into UV.
 *
 * RNG order (part of the reproducibility contract): palette first (see
 * drawTrial), then for each stroke: centre index, angle, colour index. With
 * recipe.zones, centre indices outside the zones are redrawn (one rng call
 * each). With recipe.overlap false, a stroke that overlaps an earlier one is
 * redrawn as a whole (centre and angle again) before its colour is drawn.
 * Both constraints change the recipe hash, so they never alter an existing
 * recipe's trials.
 *
 * @param {function(): number} rng
 * @param {{meshPx: object[], pxPerCm: number, triangles: number[][], uv: number[][]}} anchor
 * @param {object} recipe Normalised recipe.
 * @param {object[]} colours Palette colours.
 */
export function drawStrokes(rng, anchor, recipe, colours) {
   const hulls = regionHulls(anchor.meshPx);
   const oval = hulls.faceOval;
   const step = 0.2 * anchor.pxPerCm; // 2 mm boundary sampling
   const grid = 0.1 * anchor.pxPerCm; // 1 mm area sampling
   const zoneOf = recipe.zones ? zonesOfMesh(anchor.meshPx) : null;
   const allowed = recipe.zones ? new Set(recipe.zones) : null;
   const noOverlap = recipe.overlap === false;
   const strokes = [];
   for (let s = 0; s < recipe.count; s += 1) {
      let centreIndex; let angleDeg; let rect; let clipped;
      let attempts = 0;
      for (;;) {
         centreIndex = Math.floor(rng() * STROKE_CENTRE_COUNT);
         if (allowed) {
            while (!allowed.has(zoneOf[centreIndex])) {
               attempts += 1;
               if (attempts > PLACEMENT_ATTEMPTS) throw new Error(`recipe zones ${recipe.zones.join(',')}: no mesh point found in them after ${PLACEMENT_ATTEMPTS} draws`);
               centreIndex = Math.floor(rng() * STROKE_CENTRE_COUNT);
            }
         }
         angleDeg = rng() * 180;
         rect = rotatedRect(anchor.meshPx[centreIndex], recipe.lengthCm * anchor.pxPerCm, recipe.widthCm * anchor.pxPerCm, angleDeg);
         clipped = clipToConvex(rect, oval);
         if (!noOverlap) break;
         const previous = strokes.filter((p) => p.anchorPolygonPx.length >= 3).map((p) => p.anchorPolygonPx.map(([x, y]) => ({ x, y })));
         if (clipped.length >= 3 && !previous.some((poly) => convexPolygonsOverlap(clipped, poly))) break;
         attempts += 1;
         if (attempts > PLACEMENT_ATTEMPTS) throw new Error(`overlap false: could not place stroke ${s + 1} of ${recipe.count} without overlap after ${PLACEMENT_ATTEMPTS} attempts; use fewer or smaller strokes`);
      }
      const colourIndex = Math.floor(rng() * colours.length);
      const rectArea = polygonArea(rect);
      const clippedArea = clipped.length >= 3 ? polygonArea(clipped) : 0;
      const outline = clipped.length >= 3 ? densify(clipped, step) : [];
      const mapped = outline.map((p) => anchorPointToUv(p, anchor.meshPx, anchor.triangles, anchor.uv));
      const samples = clipped.length >= 3 ? gridSamples(clipped, grid) : [];
      const share = (polys) => (samples.length
         ? round(samples.filter((p) => polys.some((poly) => pointInPolygon(p, poly))).length / samples.length, 3)
         : 0);
      strokes.push({
         centreIndex,
         angleDeg: round(angleDeg, 2),
         colourIndex,
         colour: colours[colourIndex].hex,
         anchorPolygonPx: clipped.map((p) => [round(p.x, 1), round(p.y, 1)]),
         uvPolygon: mapped.map((m) => m.uv),
         snappedShare: mapped.length ? round(mapped.filter((m) => !m.inside).length / mapped.length, 3) : 0,
         clippedShare: round(1 - clippedArea / rectArea, 3),
         regions: { eyes: share(hulls.eyes), brows: share(hulls.brows), lips: share(hulls.lips), nose: share(hulls.nose) },
      });
   }
   // Coverage: share of the face oval under at least one stroke.
   const ovalSamples = gridSamples(oval, grid * 2);
   const polys = strokes.filter((s) => s.anchorPolygonPx.length >= 3).map((s) => s.anchorPolygonPx.map(([x, y]) => ({ x, y })));
   const covered = ovalSamples.filter((p) => polys.some((poly) => pointInPolygon(p, poly))).length;
   return { strokes, coverage: ovalSamples.length ? round(covered / ovalSamples.length, 3) : 0 };
}

/** Seed of the separate palette stream of paired recipes (any fixed odd constant works). */
export const PALETTE_STREAM_XOR = 0x9E3779B9;

/**
 * Everything random about one trial, from its seed. Pure: the same seed,
 * recipe and atlas always give the same palette and strokes.
 *
 * Default recipes draw palette and strokes from one stream, so the number of
 * palette rejections (which depends on the skin swatch) shifts the stroke
 * draws: the same seed gives different strokes on different faces. With
 * recipe.color (no palette draw) or recipe.pairedSeeds (palette from its own
 * stream, seed ^ PALETTE_STREAM_XOR) the strokes depend on the seed alone,
 * so a seed names the same design on every face.
 */
export function drawTrial(seed, recipe, anchor, skinLab) {
   const rng = mulberry32(seed);
   let palette;
   if (recipe.color) palette = fixedPalette(recipe.color, skinLab);
   else if (recipe.pairedSeeds) palette = drawPalette(mulberry32((seed ^ PALETTE_STREAM_XOR) >>> 0), skinLab, recipe.palette);
   else palette = drawPalette(rng, skinLab, recipe.palette);
   const { strokes, coverage } = drawStrokes(rng, anchor, recipe, palette.colours);
   return { seed, palette, strokes, coverage };
}

// ---------------------------------------------------------------------------
// Distances and scores
// ---------------------------------------------------------------------------

export function euclidean(a, b) {
   let s = 0;
   for (let i = 0; i < a.length; i += 1) { const d = a[i] - b[i]; s += d * d; }
   return Math.sqrt(s);
}

/**
 * For each imprint, the clean distance to the imprint nearest in pose
 * (yaw, pitch): how far the face drifts on its own.
 */
export function noiseFloor(imprints) {
   return imprints.map((imp) => {
      let best = null;
      let bestPose = Infinity;
      for (const other of imprints) {
         if (other === imp) continue;
         const d = Math.hypot(other.yaw - imp.yaw, other.pitch - imp.pitch);
         if (d < bestPose) { bestPose = d; best = other; }
      }
      return best ? round(euclidean(imp.descriptor, best.descriptor), 4) : null;
   });
}

/**
 * One evasion-profile row.
 *
 * @param {object} imprint Clean imprint.
 * @param {number[]|null} overlayDescriptor null when the face was lost.
 * @param {object[]} imprints Whole atlas (the reference identity).
 * @param {'ok'|'weak'|'lost'} detection
 */
export function profileRow(imprint, overlayDescriptor, imprints, detection, score) {
   if (!overlayDescriptor) {
      return { id: imprint.id, t: imprint.t, yaw: imprint.yaw, pitch: imprint.pitch, detection: 'lost', score: null, dPair: null, dAtlas: null, nearestId: null, noise: imprint.noise };
   }
   let dAtlas = Infinity;
   let nearestId = null;
   for (const other of imprints) {
      const d = euclidean(overlayDescriptor, other.descriptor);
      if (d < dAtlas) { dAtlas = d; nearestId = other.id; }
   }
   return {
      id: imprint.id,
      t: imprint.t,
      yaw: imprint.yaw,
      pitch: imprint.pitch,
      detection,
      score: round(score, 3),
      dPair: round(euclidean(overlayDescriptor, imprint.descriptor), 4),
      dAtlas: round(dAtlas, 4),
      nearestId,
      noise: imprint.noise,
   };
}

export function escapes(row, threshold = MATCH_THRESHOLD) {
   return row.detection === 'lost' || (row.dAtlas !== null && row.dAtlas >= threshold);
}

/**
 * Trial scores. worstCase is the smallest dAtlas over the imprints; when every
 * imprint lost the face it is null and allLost is true (better than any
 * number).
 *
 * escapeRate splits into two mechanisms, added in 1.1.0:
 *   lostRate         share of imprints where the detector found no face at all
 *                    (not even at the weak threshold): the overlay broke detection.
 *   descriptorEscape share of imprints where a face WAS found but its descriptor
 *                    is ≥ threshold from every clean imprint: the identity moved.
 *   escapeRate = lostRate + descriptorEscape.
 *   descriptorEscapeDetected is the same count over the detected imprints only
 *   (null when none was detected): how often the overlay changes who face-api
 *   sees, given that it sees someone.
 */
export function scoreProfile(rows, threshold = MATCH_THRESHOLD) {
   const n = rows.length;
   const escaped = rows.filter((row) => escapes(row, threshold)).length;
   const lost = rows.filter((row) => row.detection === 'lost').length;
   const measured = rows.filter((row) => row.dAtlas !== null).map((row) => row.dAtlas);
   const margins = rows.map((row) => (row.detection === 'lost' ? Infinity : row.dAtlas - threshold));
   const med = median(margins);
   const detected = n - lost;
   return {
      escapeRate: n ? round(escaped / n, 4) : 0,
      lostRate: n ? round(lost / n, 4) : 0,
      descriptorEscape: n ? round((escaped - lost) / n, 4) : 0,
      descriptorEscapeDetected: detected ? round((escaped - lost) / detected, 4) : null,
      worstCase: measured.length ? round(Math.min(...measured), 4) : null,
      allLost: n > 0 && measured.length === 0,
      medianMargin: Number.isFinite(med) ? round(med, 4) : null,
      lost,
      weak: rows.filter((row) => row.detection === 'weak').length,
      imprints: n,
   };
}

/** worstCase as a sortable number: all lost beats everything. */
export function worstCaseValue(scores) {
   if (scores.allLost) return Infinity;
   return scores.worstCase === null ? -Infinity : scores.worstCase;
}

/**
 * Pareto front on (escapeRate, worstCase), both maximised.
 *
 * @param {object[]} items Each with `.scores`.
 * @returns {Set<object>} The non-dominated items.
 */
export function paretoFront(items) {
   const front = new Set();
   for (const a of items) {
      const ae = a.scores.escapeRate;
      const aw = worstCaseValue(a.scores);
      const dominated = items.some((b) => {
         if (b === a) return false;
         const be = b.scores.escapeRate;
         const bw = worstCaseValue(b.scores);
         return be >= ae && bw >= aw && (be > ae || bw > aw);
      });
      if (!dominated) front.add(a);
   }
   return front;
}

/**
 * Top-K for materialisation: the Pareto front first (by escapeRate), then
 * the rest by escapeRate and worstCase, up to K.
 */
export function selectTop(items, k) {
   const front = paretoFront(items);
   const byEscape = (a, b) => (b.scores.escapeRate - a.scores.escapeRate) || (worstCaseValue(b.scores) - worstCaseValue(a.scores));
   const first = [...front].sort(byEscape);
   const rest = items.filter((item) => !front.has(item)).sort(byEscape);
   return first.concat(rest).slice(0, Math.max(k, 0));
}

/** Evenly spaced imprint indices after sorting by yaw: the early-stopping subset. */
export function stratifiedSubset(imprints, size) {
   const order = imprints.map((imp, index) => ({ index, yaw: imp.yaw })).sort((a, b) => a.yaw - b.yaw);
   if (order.length <= size) return order.map((o) => o.index);
   const picked = new Set();
   for (let i = 0; i < size; i += 1) picked.add(order[Math.round((i * (order.length - 1)) / (size - 1))].index);
   return [...picked];
}

// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------

const RECIPE_KEYS = ['name', 'shape', 'count', 'lengthCm', 'widthCm', 'opacity', 'palette', 'color', 'overlap', 'zones', 'pairedSeeds'];
const PALETTE_KEYS = ['pool', 'size', 'contrast', 'quantile', 'minPairDeltaE'];

/**
 * Validate and complete a recipe. Unknown keys are errors: a typo must not
 * silently fall back to a default.
 *
 * Optional keys added in 1.1.0 (also settable from the CLI: --color,
 * --no-overlap, --zones, --paired). They are written into the normalised
 * recipe only when they differ from the default, so a recipe without them
 * keeps the hash, recipeId and trials it had in 1.0.0:
 *   color        CSS colour forced on every stroke; the palette is not drawn.
 *   overlap      false: strokes must not overlap one another.
 *   zones        subset of ZONES the stroke centres are drawn from.
 *   pairedSeeds  true: palette from its own random stream, so the strokes of a
 *                seed are the same on every face (see drawTrial).
 * color and pairedSeeds exclude each other: with a forced colour there is no
 * palette to pair.
 */
export function normaliseRecipe(raw) {
   if (!raw || typeof raw !== 'object') throw new Error('recipe: not a JSON object');
   const unknown = Object.keys(raw).filter((k) => !RECIPE_KEYS.includes(k));
   if (unknown.length) throw new Error(`recipe: unknown key(s) ${unknown.join(', ')}. Allowed: ${RECIPE_KEYS.join(', ')}`);
   const palette = raw.palette || {};
   const unknownPalette = Object.keys(palette).filter((k) => !PALETTE_KEYS.includes(k));
   if (unknownPalette.length) throw new Error(`recipe.palette: unknown key(s) ${unknownPalette.join(', ')}. Allowed: ${PALETTE_KEYS.join(', ')}`);
   const num = (value, name, min, max) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
         throw new Error(`recipe: ${name} must be a number between ${min} and ${max}`);
      }
      return value;
   };
   const shape = raw.shape ?? 'line';
   if (shape !== 'line') throw new Error('recipe: only shape "line" exists for now');
   let opacity = num(raw.opacity ?? 0.8, 'opacity', 0, 100);
   if (opacity > 1) opacity /= 100;
   const pool = palette.pool ?? 'xterm256';
   if (pool !== 'xterm256') throw new Error('recipe.palette.pool: only "xterm256" exists for now');
   const contrast = palette.contrast ?? 'luminance';
   if (!['luminance', 'perceptual'].includes(contrast)) throw new Error('recipe.palette.contrast must be "luminance" or "perceptual"');
   const name = String(raw.name ?? 'recipe').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 40) || 'recipe';
   const out = {
      name,
      shape,
      count: Math.round(num(raw.count ?? 3, 'count', 1, 50)),
      lengthCm: num(raw.lengthCm ?? 5, 'lengthCm', 0.1, 30),
      widthCm: num(raw.widthCm ?? 2, 'widthCm', 0.05, 30),
      opacity: round(opacity, 4),
      palette: {
         pool,
         size: Math.round(num(palette.size ?? 4, 'palette.size', 1, 16)),
         contrast,
         quantile: num(palette.quantile ?? 0.75, 'palette.quantile', 0, 1),
         minPairDeltaE: num(palette.minPairDeltaE ?? 20, 'palette.minPairDeltaE', 0, 100),
      },
   };
   if (raw.color !== undefined && raw.color !== null) {
      if (typeof raw.color !== 'string') throw new Error('recipe.color must be a CSS colour string');
      out.color = rgbToHex(parseCssColour(raw.color)); // canonical #rrggbb: "white", "#fff" and "#ffffff" are one recipe
   }
   if (raw.overlap !== undefined && raw.overlap !== null) {
      if (typeof raw.overlap !== 'boolean') throw new Error('recipe.overlap must be true or false');
      if (!raw.overlap) out.overlap = false;
   }
   if (raw.zones !== undefined && raw.zones !== null) {
      if (!Array.isArray(raw.zones) || !raw.zones.length) throw new Error(`recipe.zones must be a non-empty array of ${ZONES.join(', ')}`);
      const zones = [...new Set(raw.zones.map((z) => String(z).trim().toLowerCase()))];
      const bad = zones.filter((z) => !ZONES.includes(z));
      if (bad.length) throw new Error(`recipe.zones: unknown zone(s) ${bad.join(', ')}. Allowed: ${ZONES.join(', ')}`);
      if (zones.length < ZONES.length) out.zones = ZONES.filter((z) => zones.includes(z)); // canonical order, all zones = no constraint
   }
   if (raw.pairedSeeds !== undefined && raw.pairedSeeds !== null) {
      if (typeof raw.pairedSeeds !== 'boolean') throw new Error('recipe.pairedSeeds must be true or false');
      if (raw.pairedSeeds) out.pairedSeeds = true;
   }
   if (out.color && out.pairedSeeds) throw new Error('recipe: color and pairedSeeds exclude each other (a forced colour draws no palette, so there is nothing to pair)');
   return out;
}

/** Short stable hash of a normalised recipe (FNV-1a over its canonical JSON). */
export function recipeHash(recipe) {
   const canonical = JSON.stringify(recipe, Object.keys(recipe).sort().concat(Object.keys(recipe.palette).sort()));
   let h = 0x811c9dc5;
   for (let i = 0; i < canonical.length; i += 1) {
      h ^= canonical.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
   }
   return h.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Ghostyle source
// ---------------------------------------------------------------------------

/** Texture resolution of generated Ghostyles (the lab's default is 256). */
export const GHOSTYLE_TEXTURE_SIZE = 1024;

/**
 * The source of a paintUV Ghostyle that fills the trial's UV polygons.
 *
 * The harness imports this very text (as a Blob module) to measure the trial,
 * so the file written to disk is the code that was measured; `extraComment`
 * only adds a comment block (scores, provenance).
 */
export function buildGhostyleSource({ recipe, recipeId, seed, strokes, palette, date, atlasSource, extraComment = '' }) {
   const name = `Fuzz ${recipe.name} #${seed}`;
   const description = `ghostyle-fuzz trial: ${recipe.count} ${recipe.shape} stroke(s) ${recipe.lengthCm}x${recipe.widthCm} cm, opacity ${recipe.opacity}, recipe ${recipeId}, seed ${seed}.`;
   const strokeData = strokes
      .filter((s) => s.uvPolygon.length >= 3)
      .map((s) => `   { colour: '${s.colour}', points: ${JSON.stringify(s.uvPolygon)} }`)
      .join(',\n');
   const comment = [
      `atlas source : ${atlasSource || '-'}`,
      `recipe       : ${JSON.stringify(recipe)}`,
      `palette      : ${palette.colours.map((c) => `${c.hex} (${c.xterm === null ? `forced "${palette.forced}"` : `xterm ${c.xterm}`}, dL ${c.deltaL})`).join(', ')}`,
      `reproduce    : node scripts-dev/ghostyle-fuzz.cjs trial --atlas <pose-atlas.json> --recipe <recipe.json> --seed ${seed} --trials 1`,
      ...extraComment.split('\n').filter(Boolean),
   ].map((line) => ` * ${line}`).join('\n');
   return `/**
 * ==Ghostyle==
 * @name         ${name}
 * @version      1.0.0
 * @author       ghostyle-fuzz
 * @release_date ${date}
 * @description  ${description}
 * ==/Ghostyle==
 */

/*
 * Generated by scripts-dev/ghostyle-fuzz.cjs. Polygons are in the canonical
 * MediaPipe UV space (data/face_canonical_uv.json), as fractions of the
 * texture; the lab warps the texture onto the face mesh every frame.
 *
${comment}
 */

export const textureSize = ${GHOSTYLE_TEXTURE_SIZE};

const OPACITY = ${recipe.opacity};

const STROKES = [
${strokeData}
];

export function paintUV(ctx) {
   const w = ctx.canvas.width;
   const h = ctx.canvas.height;
   ctx.save();
   ctx.globalAlpha = OPACITY;
   for (const stroke of STROKES) {
      ctx.beginPath();
      stroke.points.forEach(([u, v], i) => {
         if (i === 0) ctx.moveTo(u * w, v * h);
         else ctx.lineTo(u * w, v * h);
      });
      ctx.closePath();
      ctx.fillStyle = stroke.colour;
      ctx.fill();
   }
   ctx.restore();
}
`;
}
