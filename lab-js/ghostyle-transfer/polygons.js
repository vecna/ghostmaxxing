/** @module ghostyle-transfer/polygons */
import { medianBin, TRANSFER_TEXTURE_SIZE } from './uv-diff.js';

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * A colored region in canonical UV coordinates.
 * @typedef {object} TransferPolygon
 * @property {string} color Representative color as CSS hex.
 * @property {number[][][]} rings Perimeter and any inner boundaries.
 */

/**
 * Walks the directed perimeter of one connected component. The rightmost
 * available turn keeps the filled area on the same side of the contour, even
 * at a corner shared by two edges. Inner loops become holes when filled.
 * @param {Set<number>} edges Corner IDs multiplied by four plus direction.
 * @param {number} stride Number of corners in a grid row.
 * @returns {number[][][]} Closed rings, each without a repeated first vertex.
 */
function traceRings(edges, stride) {
   const rings = [];
   while (edges.size) {
      const start = edges.values().next().value;
      const ring = [];
      let edge = start;
      do {
         edges.delete(edge);
         const corner = Math.floor(edge / 4);
         const direction = edge % 4;
         ring.push([corner % stride, Math.floor(corner / stride)]);
         const next = (corner + DX[direction] + DY[direction] * stride) * 4;
         edge = [1, 0, 3].map(turn => next + (direction + turn) % 4)
            .find(candidate => candidate === start || edges.has(candidate));
      } while (edge !== start && edge !== undefined);
      if (edge === start && ring.length >= 3) rings.push(ring);
   }
   return rings;
}

/**
 * Keeps vertices farther than a fraction of a texel from a replacement
 * segment. Using an explicit stack also handles long, jagged boundaries.
 * @param {number[][]} points Closed boundary with its first vertex repeated.
 * @param {number} tolerance Maximum replacement error in grid pixels.
 * @returns {number[][]} Simplified vertices in original order.
 */
function simplify(points, tolerance) {
   const last = points.length - 1;
   const keep = new Uint8Array(points.length);
   keep[0] = keep[last] = 1;
   const pending = [[0, last]];
   while (pending.length) {
      const [start, end] = pending.pop();
      const [ax, ay] = points[start];
      const [bx, by] = points[end];
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      let farthest = -1;
      let maxDistance = tolerance * tolerance;
      for (let i = start + 1; i < end; i += 1) {
         const [x, y] = points[i];
         const along = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
         const distance = (x - ax - along * dx) ** 2 + (y - ay - along * dy) ** 2;
         if (distance > maxDistance) {
            maxDistance = distance;
            farthest = i;
         }
      }
      if (farthest !== -1) {
         keep[farthest] = 1;
         pending.push([start, farthest], [farthest, end]);
      }
   }
   return points.filter((_, i) => i < last && keep[i]);
}

/**
 * Turns connected changed UV samples into editable polygons. Four-way
 * connectivity keeps strokes that touch only at a corner separate. Tiny
 * components are filtered before tracing to suppress scattered photo noise.
 * @param {object} diff Cached output of compareFaces.
 * @param {number} sensitivity Slider value from 0 to 100.
 * @param {object} [options] Contour settings for tests or alternate grids.
 * @param {number} [options.minArea] Minimum area in UV samples.
 * @param {number} [options.tolerance=0.6] Contour simplification in UV samples.
 * @returns {TransferPolygon[]} Flat colors and normalized UV rings.
 */
export function extractPolygons({ size, scores, rgb }, sensitivity, {
   minArea = Math.max(4, Math.ceil(size * size * 0.0004)),
   tolerance = 0.6,
} = {}) {
   const threshold = 90 - 0.82 * sensitivity;
   const mask = Uint8Array.from(scores, score => Number(score > threshold));
   const queue = new Uint32Array(mask.length);
   const stride = size + 1;
   const polygons = [];

   for (let seed = 0; seed < mask.length; seed += 1) {
      if (mask[seed] !== 1) continue;
      queue[0] = seed;
      mask[seed] = 2;
      let end = 1;
      for (let i = 0; i < end; i += 1) {
         const pixel = queue[i];
         const x = pixel % size;
         const y = Math.floor(pixel / size);
         for (let d = 0; d < 4; d += 1) {
            const nx = x + DX[d];
            const ny = y + DY[d];
            const neighbor = ny * size + nx;
            if (nx < 0 || nx >= size || ny < 0 || ny >= size || mask[neighbor] !== 1) continue;
            mask[neighbor] = 2;
            queue[end++] = neighbor;
         }
      }
      if (end < minArea) continue;

      const edges = new Set();
      const colors = Array.from({ length: 3 }, () => new Uint32Array(256));
      for (let i = 0; i < end; i += 1) {
         const pixel = queue[i];
         const x = pixel % size;
         const y = Math.floor(pixel / size);
         const topLeft = y * stride + x;
         if (y === 0 || !mask[pixel - size]) edges.add(topLeft * 4);
         if (x === size - 1 || !mask[pixel + 1]) edges.add((topLeft + 1) * 4 + 1);
         if (y === size - 1 || !mask[pixel + size]) edges.add((topLeft + stride + 1) * 4 + 2);
         if (x === 0 || !mask[pixel - 1]) edges.add((topLeft + stride) * 4 + 3);
         for (let channel = 0; channel < 3; channel += 1) {
            colors[channel][rgb[pixel * 3 + channel]] += 1;
         }
      }
      const rings = traceRings(edges, stride).map(ring => {
         const simplified = simplify([...ring, ring[0]], tolerance);
         return (simplified.length >= 3 ? simplified : ring)
            .map(point => point.map(value => Number((value / size).toFixed(5))));
      });
      if (!rings.length) continue;
      const color = '#' + colors.map(histogram => medianBin(histogram, end).toString(16).padStart(2, '0')).join('');
      polygons.push({ color, rings });
   }
   return polygons;
}

/**
 * Writes a standalone Ghostyle from vector geometry. Preview imports this
 * exact source, so the same fill rule and colors are used after downloading.
 * @param {TransferPolygon[]} polygons Extracted shapes.
 * @returns {string} Source of an ES module compatible with the UV renderer.
 */
export function buildTransferSource(polygons) {
   const shapes = polygons.map(polygon => '   ' + JSON.stringify(polygon)).join(',\n');
   return `/**
 * ==Ghostyle==
 * @name         Ghostyle Transfer
 * @version      1.0.0
 * @description  Flat color polygons extracted from two photos in canonical face UV coordinates.
 * ==/Ghostyle==
 */

export const textureSize = ${TRANSFER_TEXTURE_SIZE};

const polygons = [
${shapes}
];

/**
 * Paints the polygons in normalized UV space so the renderer can follow the
 * face mesh. Even-odd fill keeps unpainted holes inside a painted region.
 * @param {CanvasRenderingContext2D} ctx Destination texture context.
 */
export function paintUV(ctx) {
   const { width, height } = ctx.canvas;
   ctx.save();
   for (const { color, rings } of polygons) {
      ctx.beginPath();
      for (const [[u, v], ...points] of rings) {
         ctx.moveTo(u * width, v * height);
         for (const [x, y] of points) ctx.lineTo(x * width, y * height);
         ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.fill('evenodd');
   }
   ctx.restore();
}
`;
}
