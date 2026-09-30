#!/usr/bin/env node
/**
 * @file Visibly label synthetic JPEG/PNG fixtures, overwriting each image once.
 * @example node scripts-dev/mark-ai-images.cjs --size 15% --dry-run
 * @example node scripts-dev/mark-ai-images.cjs --size 160 path/to/images
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createCanvas, loadImage, registerFont } = require('canvas');
const ROOT = path.resolve(__dirname, '..');
const DEFAULT = path.join(ROOT, 'tests/fixtures/synthetic-faces');
let palette;

/** Load the actual project font and colour tokens; do not silently use fallbacks. */
async function setup() {
  registerFont(path.join(ROOT, 'styles/vendor/atkinson-bold.ttf'), {
    family: 'Ghostmaxxing Stamp', weight: 'bold',
  });
  const css = await fs.readFile(path.join(ROOT, 'styles/tokens.css'), 'utf8');
  palette = Object.fromEntries(['gm-bg', 'gm-ink'].map(key => {
    const match = css.match(new RegExp(`--${key}:\\s*(#[0-9a-f]{6}|rgb\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*\\))\\s*;`, 'i'));
    if (!match) throw new Error(`Missing colour token --${key}`);
    const color = match[1];
    const hex = color.startsWith('#') ? color : `#${color.slice(4, -1).split(',').map(channel => Number(channel.trim()).toString(16).padStart(2, '0')).join('')}`;
    return [key, hex];
  }));
}

/** Fixed proportions let detection recognise previous runs at other sizes too. */
function badge(width) {
  const height = Math.round(width / 3);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette['gm-ink'];
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette['gm-bg'];
  ctx.fillRect(2, 2, width - 4, height - 4);
  ctx.fillStyle = palette['gm-ink'];
  ctx.font = `bold ${Math.round(height * 0.64)}px "Ghostmaxxing Stamp"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AI Gen', width / 2, height / 2 + height * 0.03);
  return canvas;
}

/** Compare visible pixels, allowing JPEG rounding, without metadata or sidecars. */
function existingBadge(ctx, width, height, margin) {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const ink = palette['gm-ink'].slice(1).match(/../g).map(x => parseInt(x, 16));
  const nearInk = (x, y) => ink.every((v, c) => Math.abs(pixels[(y * width + x) * 4 + c] - v) < 35);
  const right = width - margin, bottom = height - margin;
  for (let size = 48; size <= width - 2 * margin; size++) {
    const h = Math.round(size / 3), left = right - size, top = bottom - h;
    if (top < margin) break;
    if (!nearInk(left, top) || !nearInk(right - 1, top) || !nearInk(left, bottom - 1)) continue;
    const expected = badge(size).getContext('2d').getImageData(0, 0, size, h).data;
    let error = 0, count = 0, close = 0;
    // Sample the whole badge, including text and border, not just its colours.
    for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 40))) {
      for (let x = 0; x < size; x += Math.max(1, Math.floor(size / 120))) {
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(pixels[((top + y) * width + left + x) * 4 + c] - expected[(y * size + x) * 4 + c]);
          error += d; count++; if (d < 30) close++;
        }
      }
    }
    if (error / count < 10 && close / count > 0.95) return size;
  }
  return null;
}

/** Read, skip an existing visible badge, or atomically replace a single image. */
async function mark(file, size, dryRun) {
  const stat = await fs.lstat(file);
  if (!stat.isFile()) throw new Error(`Not a regular file (symlinks are not followed): ${file}`);
  const bytes = await fs.readFile(file);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!jpeg && !png) throw new Error(`Only JPEG and PNG are supported: ${file}`);
  if (png && bytes.includes(Buffer.from('acTL'))) throw new Error(`Animated PNG is not supported: ${file}`);
  const img = await loadImage(bytes);
  const canvas = createCanvas(img.width, img.height), ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const margin = Math.max(4, Math.round(Math.min(img.width, img.height) * 0.01));
  const found = existingBadge(ctx, img.width, img.height, margin);
  if (found) return `SKIP ${file} (visible ${found}px badge)`;
  const w = Math.round(size.endsWith('%') ? img.width * parseFloat(size) / 100 : Number(size));
  if (w < 48 || w > img.width - 2 * margin || Math.round(w / 3) > img.height - 2 * margin) {
    throw new Error(`Badge size ${w}px does not fit ${img.width}×${img.height}; use at least 48px with room for margins: ${file}`);
  }
  if (dryRun) return `WOULD MARK ${file} (${w}px wide)`;
  const stamp = badge(w);
  ctx.drawImage(stamp, img.width - margin - stamp.width, img.height - margin - stamp.height);
  const output = jpeg ? canvas.toBuffer('image/jpeg', { quality: 0.98, chromaSubsampling: false }) : canvas.toBuffer('image/png');
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, output, { flag: 'wx', mode: stat.mode });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
  return `MARKED ${file} (${w}px wide)`;
}

async function main(args) {
  let size = '15%', dryRun = false;
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node scripts-dev/mark-ai-images.cjs [--size 15%|160] [--dry-run] [file|directory ...]\nDefault: tests/fixtures/synthetic-faces, recursively. Size is badge width.\nOverwrites JPEG/PNG; skips an existing badge even at another size. No hidden mark.');
      return;
    }
    if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--size') size = args[++i] || '';
    else if (args[i].startsWith('-')) throw new Error(`Unknown option: ${args[i]}`);
    else targets.push(path.resolve(args[i]));
  }
  if (!/^\d+(?:\.\d+)?%?$/.test(size) || parseFloat(size) <= 0) throw new Error('--size must be a positive pixel width or percentage, e.g. 160 or 15%');
  await setup();
  const files = new Set();
  async function collect(target) {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not followed: ${target}`);
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(target, { withFileTypes: true })) {
        if (entry.isDirectory() || /\.(jpe?g|png)$/i.test(entry.name)) await collect(path.join(target, entry.name));
      }
    } else files.add(target);
  }
  for (const target of targets.length ? targets : [DEFAULT]) await collect(target);
  if (!files.size) throw new Error('No JPEG/PNG images found');
  for (const file of [...files].sort()) {
    try { console.log(await mark(file, size, dryRun)); }
    catch (error) { console.error(`ERROR ${error.message}`); process.exitCode = 1; }
  }
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { setup, mark };
