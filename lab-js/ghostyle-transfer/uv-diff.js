/** @module ghostyle-transfer/uv-diff */

export const TRANSFER_TEXTURE_SIZE = 384;

/**
 * A source photo and the mesh predicted directly on that photo.
 * @typedef {object} TransferFrame
 * @property {ImageData} pixels RGBA source pixels.
 * @property {Array.<{x: number, y: number}>} mesh Landmarks normalized to the source dimensions.
 */

/**
 * Reads a subpixel color to avoid quantizing the two images differently when
 * the same UV location falls between pixels. Returns false for clipped or
 * transparent samples, which cannot establish a color change.
 * @param {ImageData} image Source pixel buffer.
 * @param {number} x Source x in pixel-center coordinates.
 * @param {number} y Source y in pixel-center coordinates.
 * @param {Uint8ClampedArray} output RGB destination.
 * @param {number} offset First destination channel.
 * @returns {boolean} Whether the sample has comparable color.
 */
function sampleRgb(image, x, y, output, offset) {
   const { width, height, data } = image;
   if (x < 0 || x > width - 1 || y < 0 || y > height - 1) return false;
   const left = Math.floor(x);
   const top = Math.floor(y);
   const right = Math.min(left + 1, width - 1);
   const bottom = Math.min(top + 1, height - 1);
   const indices = [4 * (top * width + left), 4 * (top * width + right),
      4 * (bottom * width + left), 4 * (bottom * width + right)];
   const dx = x - left;
   const dy = y - top;
   const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
   const channel = index => indices.reduce((sum, i, j) => sum + data[i + index] * weights[j], 0);
   if (channel(3) < 254) return false;
   for (let i = 0; i < 3; i += 1) output[offset + i] = channel(i);
   return true;
}

/**
 * Rasterizes the canonical mesh in UV space, lifting colors from the photo
 * with the same barycentric coordinates at every covered texel. Triangles
 * that fold against the dominant face orientation are omitted, since they
 * sample a surface that faces away or crosses itself in the projection.
 * @param {TransferFrame} frame Source photo and landmark geometry.
 * @param {object} atlas Canonical UV positions and triangle indices.
 * @param {number} size Width and height of the UV sample grid.
 * @returns {{rgb: Uint8ClampedArray, valid: Uint8Array}} Aligned samples and coverage.
 */
function sampleUv({ pixels, mesh }, { uv, triangles }, size) {
   const rgb = new Uint8ClampedArray(size * size * 3);
   const valid = new Uint8Array(size * size);
   const projected = mesh.map(p => [p.x * pixels.width - 0.5, p.y * pixels.height - 0.5]);
   const signedArea = ([a, b, c]) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
   const geometry = triangles.map(indices => {
      const points = indices.map(index => uv[index]?.map(value => value * size));
      const source = indices.map(index => projected[index]);
      if (!points.every(Boolean) || !source.every(Boolean)) return null;
      const area = signedArea(points);
      const projectedArea = signedArea(source);
      if (!Number.isFinite(projectedArea) || Math.abs(projectedArea) < 1e-6 || Math.abs(area) < 1e-6) return null;
      return { points, source, area, orientation: Math.sign(area * projectedArea) };
   }).filter(Boolean);
   const orientation = Math.sign(geometry.reduce((sum, triangle) => sum + triangle.orientation, 0));

   for (const { points: [a, b, c], source: [p, q, r], area, orientation: facing } of geometry) {
      if (facing !== orientation) continue;
      const left = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const right = Math.min(size - 1, Math.floor(Math.max(a[0], b[0], c[0])));
      const top = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const bottom = Math.min(size - 1, Math.floor(Math.max(a[1], b[1], c[1])));
      for (let y = top; y <= bottom; y += 1) {
         for (let x = left; x <= right; x += 1) {
            const dx = x + 0.5 - a[0];
            const dy = y + 0.5 - a[1];
            const v = (dx * (c[1] - a[1]) - dy * (c[0] - a[0])) / area;
            const w = ((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / area;
            const u = 1 - v - w;
            if (Math.min(u, v, w) < -1e-8) continue;
            const index = y * size + x;
            const sx = u * p[0] + v * q[0] + w * r[0];
            const sy = u * p[1] + v * q[1] + w * r[1];
            if (sampleRgb(pixels, sx, sy, rgb, index * 3)) valid[index] = 1;
         }
      }
   }
   return { rgb, valid };
}

/**
 * Returns the lower median from a histogram. Medians are less influenced by
 * a painted patch, reflections or landmark errors than an arithmetic mean.
 * @param {ArrayLike<number>} counts Bin counts in increasing order.
 * @param {number} total Number of observations.
 * @returns {number} Index of the median bin.
 */
export function medianBin(counts, total) {
   let remaining = Math.floor((total + 1) / 2);
   for (let i = 0; i < counts.length; i += 1) {
      remaining -= counts[i];
      if (remaining <= 0) return i;
   }
   return 0;
}

/**
 * Compares the two photos on their shared visible surface. A capped median
 * RGB shift compensates for small global illumination changes, while the
 * score weights chromatic changes more than a neutral brightness change.
 * Scores are cached independently of sensitivity so the slider can retrace
 * the same evidence without running either landmark model again.
 * @param {TransferFrame} clean Clean source.
 * @param {TransferFrame} painted Painted source of the same face.
 * @param {object} atlas Canonical UV geometry.
 * @param {number} [size=384] UV grid size.
 * @returns {{size: number, scores: Float32Array, rgb: Uint8ClampedArray, coverage: number}} Difference evidence.
 */
export function compareFaces(clean, painted, atlas, size = TRANSFER_TEXTURE_SIZE) {
   const before = sampleUv(clean, atlas, size);
   const after = sampleUv(painted, atlas, size);
   const scores = new Float32Array(size * size);
   const histograms = Array.from({ length: 3 }, () => new Uint32Array(511));
   let coverage = 0;
   for (let i = 0; i < scores.length; i += 1) {
      if (!before.valid[i] || !after.valid[i]) continue;
      coverage += 1;
      const offset = i * 3;
      for (let c = 0; c < 3; c += 1) {
         histograms[c][255 + after.rgb[offset + c] - before.rgb[offset + c]] += 1;
      }
   }
   if (!coverage) return { size, scores, rgb: after.rgb, coverage };
   const shift = histograms.map(histogram => Math.max(-24, Math.min(24, medianBin(histogram, coverage) - 255)));

   for (let i = 0; i < scores.length; i += 1) {
      if (!before.valid[i] || !after.valid[i]) continue;
      const offset = i * 3;
      const r = after.rgb[offset] - before.rgb[offset] - shift[0];
      const g = after.rgb[offset + 1] - before.rgb[offset + 1] - shift[1];
      const b = after.rgb[offset + 2] - before.rgb[offset + 2] - shift[2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      scores[i] = Math.hypot(luma * 0.8, (r - luma) * 0.65, (b - luma) * 0.65);
   }
   return { size, scores, rgb: after.rgb, coverage };
}
