import { describe, expect, it } from 'vitest';
import {
   anchorPointToUv,
   buildGhostyleSource,
   clipToConvex,
   convexHull,
   deltaE2000,
   drawPalette,
   mulberry32,
   normaliseRecipe,
   paretoFront,
   polygonArea,
   poseFromMatrix,
   recipeHash,
   rgbToLab,
   scoreProfile,
   selectTop,
   stratifiedSubset,
   trialSeed,
   xterm256Pool,
} from '../../scripts-dev/ghostyle-fuzz/fuzz-core.mjs';

describe('ghostyle-fuzz core: randomness', () => {
   it('mulberry32 repeats for a seed and stays in [0, 1)', () => {
      const a = mulberry32(42);
      const b = mulberry32(42);
      const xs = Array.from({ length: 1000 }, () => a());
      expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThan(1);
   });

   it('trial k of master seed S has seed S + k, wrapping at 2^32', () => {
      expect(trialSeed(100, 3)).toBe(103);
      expect(trialSeed(0xFFFFFFFF, 1)).toBe(0);
   });
});

describe('ghostyle-fuzz core: colour', () => {
   it('converts white and black to CIELAB', () => {
      const white = rgbToLab([255, 255, 255]);
      expect(white[0]).toBeCloseTo(100, 1);
      expect(Math.abs(white[1])).toBeLessThan(0.5);
      expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 5);
   });

   it('matches the CIEDE2000 reference pairs (Sharma et al. 2005)', () => {
      expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
      expect(deltaE2000([50, -1.3802, -84.2814], [50, 0, -82.7485])).toBeCloseTo(1.0, 3);
      expect(deltaE2000([2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514])).toBeCloseTo(0.9082, 3);
   });

   it('builds the xterm-256 pool without the 16 system colours', () => {
      const pool = xterm256Pool();
      expect(pool).toHaveLength(240);
      expect(pool[0]).toMatchObject({ xterm: 16, hex: '#000000' });
      expect(pool.find((c) => c.xterm === 231).hex).toBe('#ffffff');
      expect(pool.find((c) => c.xterm === 232).hex).toBe('#080808');
   });

   it('draws a repeatable, high-contrast, varied palette', () => {
      const skin = [68, 17, 13];
      const spec = { size: 4, contrast: 'luminance', quantile: 0.75, minPairDeltaE: 20 };
      const a = drawPalette(mulberry32(7), skin, spec);
      const b = drawPalette(mulberry32(7), skin, spec);
      expect(a).toEqual(b);
      expect(a.colours).toHaveLength(4);
      for (const c of a.colours) expect(c.deltaL).toBeGreaterThanOrEqual(a.contrastThreshold - 1e-9);
      for (let i = 0; i < 4; i += 1) {
         for (let j = i + 1; j < 4; j += 1) {
            expect(deltaE2000(a.colours[i].lab, a.colours[j].lab)).toBeGreaterThanOrEqual(a.usedMinPairDeltaE - 0.01);
         }
      }
   });
});

describe('ghostyle-fuzz core: geometry', () => {
   const square = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

   it('clips a polygon against a convex one', () => {
      expect(polygonArea(clipToConvex(square(0, 0, 10), square(5, 5, 10)))).toBeCloseTo(25, 6);
      expect(clipToConvex(square(0, 0, 1), square(5, 5, 1))).toHaveLength(0);
   });

   it('computes a convex hull', () => {
      const hull = convexHull([...square(0, 0, 4), { x: 2, y: 2 }, { x: 1, y: 3 }]);
      expect(hull).toHaveLength(4);
      expect(polygonArea(hull)).toBeCloseTo(16, 6);
   });

   it('maps an anchor point to UV through barycentric coordinates', () => {
      const meshPx = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 0, y: 100, z: 0 }];
      const uv = [[0.2, 0.2], [0.4, 0.2], [0.2, 0.6]];
      const inside = anchorPointToUv({ x: 50, y: 50 }, meshPx, [[0, 1, 2]], uv);
      expect(inside.inside).toBe(true);
      expect(inside.uv[0]).toBeCloseTo(0.3, 5);
      expect(inside.uv[1]).toBeCloseTo(0.4, 5);
      const outside = anchorPointToUv({ x: 200, y: 200 }, meshPx, [[0, 1, 2]], uv);
      expect(outside.inside).toBe(false);
   });

   it('reads pose from an identity transformation matrix in either layout', () => {
      const columnMajor = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, -40, 1];
      const rowMajor = [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, -40, 0, 0, 0, 1];
      for (const data of [columnMajor, rowMajor]) {
         const pose = poseFromMatrix(data);
         expect(Math.abs(pose.yaw) + Math.abs(pose.pitch) + Math.abs(pose.roll)).toBeLessThan(1e-9);
      }
   });

   it('reads a pure yaw of 30 degrees', () => {
      const t = (30 * Math.PI) / 180;
      // Rotation about y, column-major.
      const data = [Math.cos(t), 0, -Math.sin(t), 0, 0, 1, 0, 0, Math.sin(t), 0, Math.cos(t), 0, 0, 0, -40, 1];
      const pose = poseFromMatrix(data);
      expect(Math.abs(pose.yaw)).toBeCloseTo(30, 1);
      expect(Math.abs(pose.pitch)).toBeLessThan(1e-6);
   });
});

describe('ghostyle-fuzz core: scores', () => {
   const row = (id, dAtlas, detection = 'ok') => ({ id, t: id, yaw: id, pitch: 0, detection, dAtlas, dPair: dAtlas, noise: 0.2 });

   it('scores a profile: escape rate, worst case, all lost', () => {
      const s = scoreProfile([row(0, 0.4), row(1, 0.7), row(2, null, 'lost'), row(3, 0.65, 'weak')]);
      expect(s.escapeRate).toBe(0.75);
      expect(s.worstCase).toBe(0.4);
      expect(s.allLost).toBe(false);
      expect(s.lost).toBe(1);
      const lost = scoreProfile([row(0, null, 'lost'), row(1, null, 'lost')]);
      expect(lost).toMatchObject({ escapeRate: 1, worstCase: null, allLost: true });
   });

   it('finds the Pareto front on (escapeRate, worstCase)', () => {
      const t = (escapeRate, worstCase, allLost = false) => ({ scores: { escapeRate, worstCase, allLost } });
      const a = t(0.9, 0.3);
      const b = t(0.5, 0.55);
      const c = t(0.4, 0.4); // dominated by b
      const d = t(1, null, true); // all lost beats everything
      expect(paretoFront([a, b, c])).toEqual(new Set([a, b]));
      expect(paretoFront([a, b, c, d])).toEqual(new Set([d]));
      expect(selectTop([a, b, c], 2)).toEqual([a, b]);
   });

   it('spreads the early-stopping subset across yaw', () => {
      const imprints = Array.from({ length: 30 }, (_, i) => ({ yaw: i - 15 }));
      const subset = stratifiedSubset(imprints, 5);
      expect(subset).toHaveLength(5);
      expect(subset).toContain(0);
      expect(subset).toContain(29);
   });
});

describe('ghostyle-fuzz core: recipe and Ghostyle source', () => {
   it('normalises a recipe, reading opacity 80 as 80 %', () => {
      const r = normaliseRecipe({ name: 'three bands', count: 3, lengthCm: 5, widthCm: 2, opacity: 80 });
      expect(r.opacity).toBe(0.8);
      expect(r.name).toBe('three-bands');
      expect(r.palette).toMatchObject({ pool: 'xterm256', size: 4, contrast: 'luminance' });
      expect(recipeHash(r)).toMatch(/^[0-9a-f]{8}$/);
   });

   it('rejects unknown recipe keys', () => {
      expect(() => normaliseRecipe({ widht: 2 })).toThrow(/unknown key/);
      expect(() => normaliseRecipe({ palette: { colours: 4 } })).toThrow(/unknown key/);
   });

   it('writes a paintUV Ghostyle that meets the plugin contract', () => {
      const recipe = normaliseRecipe({ name: 'x', count: 1 });
      const source = buildGhostyleSource({
         recipe,
         recipeId: 'x-00000000',
         seed: 5,
         date: '2026-10-20',
         palette: { colours: [{ hex: '#000000', xterm: 16, deltaL: 60 }] },
         strokes: [{ colour: '#000000', uvPolygon: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]] }],
      });
      expect(source).toMatch(/==Ghostyle==[\s\S]*@name\s+Fuzz x #5[\s\S]*@description\s+\S[\s\S]*==\/Ghostyle==/);
      expect(source).toMatch(/export\s+function\s+paintUV\s*\(/);
      expect(source).toContain('export const textureSize = 1024;');
   });
});
