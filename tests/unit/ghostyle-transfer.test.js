import { describe, expect, it, vi } from 'vitest';
import { buildTransferSource, extractPolygons } from '../../lab-js/ghostyle-transfer/polygons.js';
import { compareFaces, medianBin } from '../../lab-js/ghostyle-transfer/uv-diff.js';

const skin = [159, 119, 95];
const red = [220, 32, 42];
const blue = [32, 72, 220];
const atlas = { uv: [[0, 0], [1, 0], [1, 1], [0, 1]], triangles: [[0, 1, 2], [0, 2, 3]] };
const bounds = [4, 4, 36, 36];
const size = 32;

/** Creates a raster with a patch in face coordinates and unrelated background outside the mesh. */
function portrait([left, top, right, bottom], background, paint, shape = [8, 8, 16, 16]) {
   const width = 48;
   const height = 48;
   const data = new Uint8ClampedArray(width * height * 4);
   const [xStart, yStart, xEnd, yEnd] = shape;
   for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
         const ux = (x - left + 0.5) * size / (right - left);
         const uy = (y - top + 0.5) * size / (bottom - top);
         const face = ux >= 0 && ux < size && uy >= 0 && uy < size;
         const patch = ux >= xStart && ux < xEnd && uy >= yStart && uy < yEnd;
         data.set([...(face ? paint && patch ? paint : skin : background), 255], (y * width + x) * 4);
      }
   }
   const mesh = [[left, top], [right, top], [right, bottom], [left, bottom]]
      .map(([x, y]) => ({ x: x / width, y: y / height }));
   return { pixels: { width, height, data }, mesh };
}

/** Evaluates polygon coverage at UV sample centers for comparison to a known mask. */
function contains(rings, x, y) {
   let inside = false;
   for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 1) {
         const [ax, ay] = ring[i];
         const [bx, by] = ring[(i + 1) % ring.length];
         if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
      }
   }
   return inside;
}

describe('canonical face transfer', () => {
   it('compares the same surface even when the face is translated and the background changes', () => {
      const clean = portrait(bounds, blue);
      const painted = portrait([9, 12, 41, 44], red, red);
      const diff = compareFaces(clean, painted, atlas, size);
      expect(diff.coverage).toBe(size * size);
      const [polygon, ...other] = extractPolygons(diff, 65);
      expect(other).toEqual([]);
      expect(polygon.color).toBe('#dc202a');
      for (let y = 0; y < size; y += 1) {
         for (let x = 0; x < size; x += 1) {
            expect(contains(polygon.rings, (x + 0.5) / size, (y + 0.5) / size))
               .toBe(x >= 8 && x < 16 && y >= 8 && y < 16);
         }
      }
   });

   it('compensates for a global color shift, leaving an identical face empty', () => {
      const clean = portrait(bounds, blue);
      const lighter = portrait(bounds, red);
      for (let i = 0; i < lighter.pixels.data.length; i += 4) {
         lighter.pixels.data[i] += 22;
         lighter.pixels.data[i + 1] += 17;
         lighter.pixels.data[i + 2] += 13;
      }
      expect(extractPolygons(compareFaces(clean, lighter, atlas, size), 100)).toEqual([]);
      expect(extractPolygons(compareFaces(clean, clean, atlas, size), 100)).toEqual([]);
   });

   it('ignores clipped and transparent samples', () => {
      const clean = portrait(bounds, blue);
      const offscreen = portrait([49, 50, 81, 82], red, red);
      expect(compareFaces(clean, offscreen, atlas, size).coverage).toBe(0);
      const transparent = portrait(bounds, red, red);
      for (let i = 3; i < transparent.pixels.data.length; i += 4) transparent.pixels.data[i] = 0;
      expect(compareFaces(clean, transparent, atlas, size).coverage).toBe(0);
   });

   it('separates corner-touching regions, keeps the ring hole and rejects tiny noise', () => {
      const scores = new Float32Array(size * size);
      const rgb = new Uint8ClampedArray(size * size * 3);
      const mark = (x, y, score, color) => {
         const i = y * size + x;
         scores[i] = score;
         rgb.set(color, i * 3);
      };
      for (let y = 2; y < 10; y += 1) {
         for (let x = 2; x < 10; x += 1) {
            if (x < 4 || x > 7 || y < 4 || y > 7) mark(x, y, 100, red);
         }
      }
      for (let y = 10; y < 16; y += 1) {
         for (let x = 10; x < 16; x += 1) mark(x, y, 45, blue);
      }
      mark(31, 31, 150, red);
      const diff = { size, scores, rgb };
      expect(extractPolygons(diff, 0)).toHaveLength(1);
      const polygons = extractPolygons(diff, 65);
      expect(polygons.map(({ color, rings }) => [color, rings.length])).toEqual([
         ['#dc202a', 2], ['#2048dc', 1],
      ]);
      expect(contains(polygons[0].rings, 3 / size, 3 / size)).toBe(true);
      expect(contains(polygons[0].rings, 6 / size, 6 / size)).toBe(false);
      expect(medianBin([2, 0, 2], 4)).toBe(0);
   });

   it('exports standalone paintUV code with scaled vertices and even-odd fill', async () => {
      const polygon = { color: '#102030', rings: [[[0.1, 0.2], [0.9, 0.2], [0.4, 0.7]]] };
      const source = buildTransferSource([polygon]);
      const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
      const module = await import(/* @vite-ignore */ url);
      const ctx = {
         canvas: { width: 100, height: 200 }, beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
         closePath: vi.fn(), fill: vi.fn(), save: vi.fn(), restore: vi.fn(),
      };
      module.paintUV(ctx);
      expect(source).toContain('==Ghostyle==');
      expect(ctx.moveTo).toHaveBeenCalledWith(10, 40);
      expect(ctx.lineTo).toHaveBeenLastCalledWith(40, 140);
      expect(ctx.fillStyle).toBe(polygon.color);
      expect(ctx.fill).toHaveBeenCalledWith('evenodd');
      expect(ctx.restore).toHaveBeenCalledOnce();
   });
});
