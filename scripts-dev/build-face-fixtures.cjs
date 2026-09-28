#!/usr/bin/env node
/**
 * Build fake-webcam fixtures from the synthetic face pairs.
 *
 * Chromium can replace the webcam with a raw Y4M file. This script turns each
 * `figureN-clean.jpeg` / `figureN-painted.jpeg` pair in
 * `tests/fixtures/synthetic-faces/` into three Y4M clips:
 *
 *   figureN-clean.y4m     the bare face, long enough to save an identity
 *   figureN-painted.y4m   the same face wearing the makeup
 *   figureN-pair.y4m      clean then painted, concatenated, for one session
 *
 * The pair file gives a single clean-then-painted feed for anyone driving the
 * lab by hand: save the identity while the clean segment is on screen, read
 * the distance as the painted segment arrives. `lab-capture.cjs` no longer
 * needs these clips: it converts pictures itself and takes the two files
 * directly (`measure --baseline clean.jpeg --dazzled painted.jpeg`).
 *
 * Requires ffmpeg on PATH. Output is large (roughly 7 MB per second at
 * 640x480) and is git-ignored.
 *
 * Usage:
 *   node scripts-dev/build-face-fixtures.cjs --figure 9,10
 *   node scripts-dev/build-face-fixtures.cjs --figure all --force
 *   node scripts-dev/build-face-fixtures.cjs --figure 9 --size 320x240
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.join(ROOT, 'tests', 'fixtures', 'synthetic-faces');
const DEFAULT_OUTPUT = path.join(DEFAULT_SOURCE, 'y4m');
const VARIANTS = ['clean', 'painted'];

function usage() {
   return `
Build Y4M fake-webcam fixtures from the synthetic face pairs.

Options:
  --figure <list>       Figure numbers, comma-separated, or all (required)
  --source <path>       Where the JPEG pairs live
                        (default: tests/fixtures/synthetic-faces)
  --output <path>       Where the Y4M files are written
                        (default: tests/fixtures/synthetic-faces/y4m)
  --size <WxH>          Frame size (default: 640x480)
  --fps <n>             Frames per second (default: 15)
  --clean-seconds <n>   Length of the clean segment (default: 6)
  --painted-seconds <n> Length of the painted segment (default: 10)
  --face-height <n>     Face height inside the frame, in pixels (default: 300)
  --background <hex>    Padding colour (default: 0x9a938c)
  --keep-singles        Keep figureN-clean.y4m and figureN-painted.y4m
                        (default: kept; use --pair-only to delete them)
  --pair-only           Delete the single-variant clips after concatenating
  --force               Rebuild files that already exist
  --help                Show this help

Examples:
  node scripts-dev/build-face-fixtures.cjs --figure 9,10
  node scripts-dev/build-face-fixtures.cjs --figure all --force
`;
}

function requireValue(argv, index, option) {
   const value = argv[index + 1];
   if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
   return value;
}

function parseArgs(argv) {
   const options = {
      figures: null,
      source: DEFAULT_SOURCE,
      output: DEFAULT_OUTPUT,
      size: '640x480',
      fps: 15,
      cleanSeconds: 6,
      paintedSeconds: 10,
      faceHeight: 300,
      background: '0x9a938c',
      pairOnly: false,
      force: false,
   };

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--help') {
         process.stdout.write(usage());
         process.exit(0);
      }
      if (arg === '--force') { options.force = true; continue; }
      if (arg === '--pair-only') { options.pairOnly = true; continue; }
      if (arg === '--keep-singles') { options.pairOnly = false; continue; }
      if (arg === '--figure') { options.figures = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--source') { options.source = path.resolve(ROOT, requireValue(argv, index, arg)); index += 1; continue; }
      if (arg === '--output') { options.output = path.resolve(ROOT, requireValue(argv, index, arg)); index += 1; continue; }
      if (arg === '--size') { options.size = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--background') { options.background = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--fps' || arg === '--clean-seconds' || arg === '--painted-seconds' || arg === '--face-height') {
         const value = Number(requireValue(argv, index, arg));
         if (!Number.isFinite(value) || value <= 0) throw new Error(`${arg} must be a positive number.`);
         if (arg === '--fps') options.fps = value;
         if (arg === '--clean-seconds') options.cleanSeconds = value;
         if (arg === '--painted-seconds') options.paintedSeconds = value;
         if (arg === '--face-height') options.faceHeight = value;
         index += 1;
         continue;
      }
      throw new Error(`Unknown option: ${arg}`);
   }

   if (!options.figures) throw new Error('--figure is required. Pass numbers such as 9,10 or the word all.');
   if (!/^\d+x\d+$/.test(options.size)) throw new Error(`--size must look like 640x480, received ${options.size}`);
   return options;
}

function discoverFigures(sourceDir) {
   if (!fs.existsSync(sourceDir)) throw new Error(`Source folder not found: ${sourceDir}`);
   const numbers = new Set();
   for (const entry of fs.readdirSync(sourceDir)) {
      const match = /^figure(\d+)-clean\.(jpe?g|png)$/i.exec(entry);
      if (match) numbers.add(Number(match[1]));
   }
   return [...numbers].sort((a, b) => a - b);
}

function resolveFigures(options) {
   if (options.figures === 'all') {
      const found = discoverFigures(options.source);
      if (!found.length) throw new Error(`No figureN-clean.jpeg files in ${options.source}`);
      return found;
   }
   const list = options.figures.split(',').map((item) => item.trim()).filter(Boolean);
   const numbers = list.map((item) => {
      const value = Number(item);
      if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid figure number: ${item}`);
      return value;
   });
   return [...new Set(numbers)].sort((a, b) => a - b);
}

function findSource(sourceDir, figure, variant) {
   for (const extension of ['jpeg', 'jpg', 'png']) {
      const candidate = path.join(sourceDir, `figure${figure}-${variant}.${extension}`);
      if (fs.existsSync(candidate)) return candidate;
   }
   return null;
}

function run(command, args) {
   const result = spawnSync(command, args, { encoding: 'utf8' });
   if (result.error) throw new Error(`${command} could not be started: ${result.error.message}`);
   if (result.status !== 0) {
      const tail = String(result.stderr || '').trim().split('\n').slice(-6).join('\n');
      throw new Error(`${command} exited with ${result.status}\n${tail}`);
   }
   return result;
}

function assertFfmpeg() {
   const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
   if (probe.error || probe.status !== 0) {
      throw new Error('ffmpeg is required and was not found on PATH. Install it, then run this script again.');
   }
}

function buildSegment(source, target, seconds, options) {
   const [width, height] = options.size.split('x').map(Number);
   const filter = [
      `scale=-1:${options.faceHeight}`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${options.background}`,
      'format=yuv420p',
   ].join(',');
   run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-loop', '1', '-i', source,
      '-t', String(seconds),
      '-r', String(options.fps),
      '-vf', filter,
      '-pix_fmt', 'yuv420p',
      target,
   ]);
}

function concatSegments(parts, target, outputDir) {
   const listFile = path.join(outputDir, `.concat-${path.basename(target, '.y4m')}.txt`);
   fs.writeFileSync(listFile, parts.map((part) => `file '${path.basename(part)}'`).join('\n') + '\n');
   try {
      run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', target]);
   } finally {
      fs.rmSync(listFile, { force: true });
   }
}

function megabytes(file) {
   return (fs.statSync(file).size / (1024 * 1024)).toFixed(1);
}

function main() {
   const options = parseArgs(process.argv.slice(2));
   assertFfmpeg();
   const figures = resolveFigures(options);
   fs.mkdirSync(options.output, { recursive: true });

   const built = [];
   const skipped = [];
   for (const figure of figures) {
      const sources = {};
      for (const variant of VARIANTS) {
         const file = findSource(options.source, figure, variant);
         if (!file) {
            skipped.push(`figure${figure}: no ${variant} image in ${path.relative(ROOT, options.source)}`);
            sources.missing = true;
            break;
         }
         sources[variant] = file;
      }
      if (sources.missing) continue;

      const pair = path.join(options.output, `figure${figure}-pair.y4m`);
      if (fs.existsSync(pair) && !options.force) {
         skipped.push(`figure${figure}: already built, pass --force to rebuild`);
         continue;
      }

      const singles = [];
      for (const variant of VARIANTS) {
         const target = path.join(options.output, `figure${figure}-${variant}.y4m`);
         const seconds = variant === 'clean' ? options.cleanSeconds : options.paintedSeconds;
         process.stdout.write(`figure${figure} ${variant}: encoding ${seconds}s ${options.size} @ ${options.fps}fps\n`);
         buildSegment(sources[variant], target, seconds, options);
         singles.push(target);
      }
      concatSegments(singles, pair, options.output);
      process.stdout.write(`figure${figure} pair   : ${megabytes(pair)} MB\n`);
      if (options.pairOnly) for (const file of singles) fs.rmSync(file, { force: true });
      built.push(figure);
   }

   process.stdout.write('\n');
   if (built.length) {
      process.stdout.write(`Built ${built.length} fixture set(s) in ${path.relative(ROOT, options.output)}: ${built.map((n) => `figure${n}`).join(', ')}\n`);
   }
   for (const line of skipped) process.stdout.write(`Skipped ${line}\n`);
   if (!built.length && !skipped.length) process.stdout.write('Nothing to do.\n');
}

try {
   main();
} catch (error) {
   process.stderr.write(`${String(error?.message || error)}\n`);
   process.exit(1);
}
