#!/usr/bin/env node
/**
 * Capture deterministic screenshots for Ghostmaxxing functional documentation.
 *
 * The script starts a local static server unless --base-url is provided, opens
 * the released interfaces with Playwright, drives representative UI states,
 * and writes localized PNGs plus a machine-readable manifest.
 *
 * Usage:
 *   node scripts-dev/capture-doc-screenshots.cjs
 *   node scripts-dev/capture-doc-screenshots.cjs --locale it --only lab
 *   node scripts-dev/capture-doc-screenshots.cjs --viewport all --headed
 */

const fs = require('node:fs');
const path = require('node:path');
const httpServer = require('http-server');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'docs', 'assets', 'screenshots');
const FAKE_CAMERA = path.join(ROOT, 'tests', 'fixtures', 'mock-face.y4m');
const LOADER_VIDEO = path.join(ROOT, 'tests', 'fixtures', 'my-moving-face.mp4');
const SUPPORTED_LOCALES = ['en', 'it', 'pt'];
const PAGE_GROUPS = ['lab', 'loader'];
const VIEWPORTS = {
   desktop: { width: 1440, height: 1000 },
   mobile: { width: 390, height: 844 },
};

function usage() {
   return `
Capture screenshots for Ghostmaxxing functional documentation.

Options:
  --output <path>       Output directory (default: docs/assets/screenshots)
  --locale <value>      en, it, pt, comma-separated values, or all (default: all)
  --viewport <value>    desktop, mobile, comma-separated values, or all
                        (default: desktop)
  --only <value>        lab, loader, comma-separated values, or all
                        (default: all)
  --loader-time <sec>   Loader frame timestamp in seconds (default: 3)
  --include-brush       Add the optional scripted Face Brush capture
  --base-url <url>      Use an already-running site instead of starting a server
  --headed              Show the browser while capturing
  --help                Show this help
`;
}

function parseList(value, allowed, label) {
   const selected = value === 'all' ? [...allowed] : value.split(',').map((item) => item.trim()).filter(Boolean);
   const invalid = selected.filter((item) => !allowed.includes(item));
   if (!selected.length || invalid.length) {
      throw new Error(`Invalid ${label}: ${value}. Expected ${allowed.join(', ')} or all.`);
   }
   return [...new Set(selected)];
}

function requireValue(argv, index, option) {
   const value = argv[index + 1];
   if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
   return value;
}

function parseArgs(argv) {
   const options = {
      output: DEFAULT_OUTPUT,
      locales: [...SUPPORTED_LOCALES],
      viewports: ['desktop'],
      only: [...PAGE_GROUPS],
      loaderTime: 3,
      includeBrush: false,
      baseUrl: null,
      headed: false,
   };

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--help') {
         process.stdout.write(usage());
         process.exit(0);
      }
      if (arg === '--headed') {
         options.headed = true;
         continue;
      }
      if (arg === '--include-brush') {
         options.includeBrush = true;
         continue;
      }
      if (arg === '--output') {
         options.output = path.resolve(ROOT, requireValue(argv, index, arg));
         index += 1;
         continue;
      }
      if (arg === '--locale') {
         options.locales = parseList(requireValue(argv, index, arg), SUPPORTED_LOCALES, 'locale');
         index += 1;
         continue;
      }
      if (arg === '--viewport') {
         options.viewports = parseList(requireValue(argv, index, arg), Object.keys(VIEWPORTS), 'viewport');
         index += 1;
         continue;
      }
      if (arg === '--only') {
         options.only = parseList(requireValue(argv, index, arg), PAGE_GROUPS, 'page group');
         index += 1;
         continue;
      }
      if (arg === '--loader-time') {
         options.loaderTime = Number(requireValue(argv, index, arg));
         if (!Number.isFinite(options.loaderTime) || options.loaderTime < 0) {
            throw new Error('--loader-time must be a non-negative number.');
         }
         index += 1;
         continue;
      }
      if (arg === '--base-url') {
         options.baseUrl = requireValue(argv, index, arg).replace(/\/$/, '');
         index += 1;
         continue;
      }
      throw new Error(`Unknown option: ${arg}`);
   }

   return options;
}

function assertFile(file, label) {
   if (!fs.existsSync(file)) throw new Error(`${label} not found: ${path.relative(ROOT, file)}`);
}

function findSystemChrome() {
   if (process.platform !== 'linux') return undefined;
   return [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
   ].find((candidate) => fs.existsSync(candidate));
}

async function startLocalServer() {
   const server = httpServer.createServer({ root: ROOT, cache: -1, cors: false });
   await new Promise((resolve, reject) => {
      server.server.once('error', reject);
      server.server.listen(0, '127.0.0.1', resolve);
   });
   const address = server.server.address();
   return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: () => new Promise((resolve) => server.server.close(resolve)),
   };
}

function relativeFromRoot(file) {
   return path.relative(ROOT, file).split(path.sep).join('/');
}

function readPngInfo(file) {
   const header = Buffer.alloc(24);
   const handle = fs.openSync(file, 'r');
   try {
      const bytesRead = fs.readSync(handle, header, 0, header.length, 0);
      if (bytesRead !== header.length || header.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
         throw new Error(`Capture is not a valid PNG: ${file}`);
      }
   } finally {
      fs.closeSync(handle);
   }

   const widthPx = header.readUInt32BE(16);
   const heightPx = header.readUInt32BE(20);
   if (widthPx < 2 || heightPx < 2) throw new Error(`Capture has invalid dimensions: ${widthPx}x${heightPx}`);
   return {
      widthPx,
      heightPx,
      aspectRatio: Number((widthPx / heightPx).toFixed(4)),
      fileSizeBytes: fs.statSync(file).size,
   };
}

function cleanErrorMessage(error) {
   return String(error?.message || error).replace(/\u001b\[[0-9;]*m/g, '');
}

async function freezeUi(page) {
   await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
          scroll-behavior: auto !important;
        }
      `,
   });
   await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      document.activeElement?.blur?.();
   });
   await page.waitForTimeout(200);
}

async function pauseVideos(page) {
   await page.locator('video').evaluateAll((videos) => {
      for (const video of videos) video.pause();
   });
}

async function runCameraBriefly(page, milliseconds = 700) {
   await page.locator('#video').evaluate((video) => video.play());
   await page.waitForTimeout(milliseconds);
   await page.locator('#video').evaluate((video) => video.pause());
}

function createRecorder({ output, locale, viewport, manifest }) {
   return async function capture(page, id, metadata = {}) {
      const relativeFile = path.posix.join(locale, viewport, `${id}.png`);
      const absoluteFile = path.join(output, ...relativeFile.split('/'));
      fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });

      await freezeUi(page);
      if (metadata.locator) {
         const locator = page.locator(metadata.locator);
         await locator.scrollIntoViewIfNeeded();
         await locator.screenshot({ path: absoluteFile });
      } else {
         await page.screenshot({ path: absoluteFile, fullPage: Boolean(metadata.fullPage) });
      }

      const png = readPngInfo(absoluteFile);
      const viewportSize = page.viewportSize();
      const deviceScaleFactor = await page.evaluate(() => window.devicePixelRatio || 1);

      manifest.screenshots.push({
         id,
         page: metadata.page,
         locale,
         viewport,
         file: relativeFile,
         widthPx: png.widthPx,
         heightPx: png.heightPx,
         aspectRatio: png.aspectRatio,
         fileSizeBytes: png.fileSizeBytes,
         capture: metadata.locator
            ? { kind: 'element', selector: metadata.locator }
            : { kind: metadata.fullPage ? 'full-page' : 'viewport' },
         sourceViewport: viewportSize
            ? {
               widthCssPx: viewportSize.width,
               heightCssPx: viewportSize.height,
               deviceScaleFactor,
            }
            : null,
         purpose: metadata.purpose,
         stateSource: metadata.stateSource || 'live interface with committed fixtures',
      });
      process.stdout.write(`captured ${relativeFile} (${png.widthPx}x${png.heightPx})\n`);
   };
}

/**
 * Close a drawer as a state transition. A floating brand mark can overlap the
 * button visually, so a DOM click is more appropriate than testing hit targets.
 */
async function domClick(page, selector) {
   await page.locator(selector).evaluate((element) => element.click());
}

/** Paint three repeatable, face-area strokes through the Brush pointer API. */
async function paintBrushStrokes(page) {
   await page.waitForFunction(() => {
      const overlay = document.getElementById('overlay');
      const panel = document.querySelector('[data-gstmxx-plugin="brush"]');
      return Boolean(overlay && panel && getComputedStyle(overlay).pointerEvents === 'auto');
   });

   const overlay = page.locator('#overlay');
   const box = await overlay.boundingBox();
   if (!box) throw new Error('Unable to determine the Face Brush overlay dimensions.');

   const strokes = [
      [[0.37, 0.29], [0.57, 0.43]],
      [[0.35, 0.46], [0.55, 0.57]],
      [[0.56, 0.31], [0.66, 0.51]],
   ];

   for (const [[startX, startY], [endX, endY]] of strokes) {
      await page.mouse.move(box.x + box.width * startX, box.y + box.height * startY);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * endX, box.y + box.height * endY, { steps: 18 });
      await page.mouse.up();
   }

   await page.waitForFunction(() =>
      document.querySelector('[data-gstmxx-plugin="brush"] [data-role="count"]')?.textContent === '3 strokes'
   );
}

async function preparePage(context, baseUrl, route, locale) {
   const page = await context.newPage();
   page.setDefaultTimeout(60000);
   page.on('pageerror', (error) => process.stderr.write(`[${route}] page error: ${error.message}\n`));
   await page.addInitScript((selectedLocale) => {
      localStorage.clear();
      localStorage.setItem('ghostmaxxing-locale', selectedLocale);
   }, locale);
   await page.goto(`${baseUrl}/${route}`, { waitUntil: 'domcontentloaded' });
   return page;
}

async function waitForLiveEngine(page) {
   await page.waitForFunction(() => {
      const video = document.getElementById('video');
      const dot = document.getElementById('statusDot');
      return Boolean(window.gstmxx && video && video.readyState >= 2 && dot?.classList.contains('live'));
   }, undefined, { timeout: 90000 });
}

async function captureLab(context, run) {
   const page = await preparePage(context, run.baseUrl, 'lab.html', run.locale);
   try {
      await waitForLiveEngine(page);
      await page.locator('#ghostylesContainer .preview-btn').first().waitFor({ state: 'attached' });
      await runCameraBriefly(page);

      await run.capture(page, 'lab-01-camera', {
         page: 'lab.html',
         purpose: 'The initial live-camera workspace and match readout before a baseline is saved.',
      });

      await page.locator('#saveBtn').click();
      await page.waitForFunction(() => document.getElementById('dbCount')?.textContent === '1');
      await pauseVideos(page);
      await run.capture(page, 'lab-02-recognised', {
         page: 'lab.html',
         purpose: 'A saved baseline and the recognised state displayed by the local matcher.',
      });

      await page.evaluate(() => {
         window.gstmxx.events.dispatchEvent(new CustomEvent('matchStateChanged', {
            detail: {
               source: 'docs-capture',
               overall: 'eluded',
               faceapi: {
                  detectionState: 'eluded',
                  distance: 0.91,
                  matchedId: null,
                  liveMinDist: 0.91,
                  liveMinId: 0,
                  obfMinDist: null,
                  obfMinId: null,
               },
               mediapipe: null,
            },
         }));
      });
      await run.capture(page, 'lab-03-escaped-example', {
         page: 'lab.html',
         purpose: 'Illustrative escaped state for explaining distance and threshold readouts.',
         stateSource: 'documented synthetic event over the committed fake-camera stream',
      });

      await page.locator('[role="tab"][data-view="2d"]').click();
      await runCameraBriefly(page);
      await run.capture(page, 'lab-04-2d-points', {
         page: 'lab.html',
         purpose: 'The 2D landmark view used by the functional guide and technical glossary.',
      });

      await page.locator('[role="tab"][data-view="3d"]').click();
      await runCameraBriefly(page);
      await run.capture(page, 'lab-05-3d-mesh', {
         page: 'lab.html',
         purpose: 'The MediaPipe mesh view used to explain dense landmarks.',
      });

      await page.locator('[data-screen="settings"]').click();
      await page.locator('#settingsDrawer').waitFor({ state: 'visible' });
      await run.capture(page, 'lab-06-settings-and-ghostyles', {
         page: 'lab.html',
         purpose: 'Settings, thresholds, and the available Ghostyle list.',
      });

      const preferredGhostyle = page.locator('.preview-btn[data-effect="cv-dazzle-1"]');
      const firstGhostyle = page.locator('#ghostylesContainer .preview-btn').first();
      if (await preferredGhostyle.count()) await preferredGhostyle.click();
      else await firstGhostyle.click();
      await domClick(page, '#settingsDrawer [data-close-screen]');
      await runCameraBriefly(page);
      await run.capture(page, 'lab-07-ghostyle-active', {
         page: 'lab.html',
         purpose: 'A Ghostyle rendered over the deterministic fake-camera stream.',
      });

      await page.locator('[data-screen="faces"]').click();
      await page.locator('#historyDrawer').waitFor({ state: 'visible' });
      await run.capture(page, 'lab-08-saved-faces', {
         page: 'lab.html',
         purpose: 'The on-device saved-face archive after recording one baseline.',
      });

      if (run.includeBrush) {
         try {
            await domClick(page, '#historyDrawer [data-close-screen]');
            await page.locator('[role="tab"][data-view="off"]').click();
            await page.locator('[data-screen="settings"]').click();
            await page.locator('#settingsDrawer').waitFor({ state: 'visible' });

            const brush = page.locator('.preview-btn[data-effect="brush"]');
            if (!await brush.count()) throw new Error('The Face Brush Ghostyle is not available in this build.');

            await brush.click();
            if (await page.locator('#settingsDrawer').isVisible()) {
               await domClick(page, '#settingsDrawer [data-close-screen]');
            }
            await runCameraBriefly(page, 1000);
            await paintBrushStrokes(page);
            await runCameraBriefly(page, 500);
            await run.capture(page, 'lab-09-brush-painted', {
               page: 'lab.html',
               purpose: 'Optional Face Brush authoring state with three face-anchored digital paint strokes.',
               stateSource: 'scripted pointer strokes over the committed fake-camera stream',
            });
         } catch (error) {
            const reason = cleanErrorMessage(error);
            run.manifest.skipped.push({
               id: 'lab-09-brush-painted',
               page: 'lab.html',
               locale: run.locale,
               viewport: run.viewport,
               reason,
            });
            process.stderr.write(`optional Brush capture skipped (${run.locale}, ${run.viewport}): ${reason}\n`);
         }
      }
   } finally {
      await page.close();
   }
}

async function captureLoader(context, run) {
   const page = await preparePage(context, run.baseUrl, 'loader.html', run.locale);
   try {
      await page.waitForFunction(() => document.getElementById('statusDot')?.classList.contains('live'), undefined, {
         timeout: 90000,
      });
      await run.capture(page, 'loader-01-empty', {
         page: 'loader.html',
         purpose: 'The Loader before selecting a local video.',
         locator: '.loader-band--stage',
      });

      await page.setInputFiles('#videoFile', LOADER_VIDEO);
      await page.waitForFunction(() => {
         const video = document.getElementById('video');
         return video && video.videoWidth > 0 && Number.isFinite(video.duration);
      });
      const capturedTime = await page.locator('#video').evaluate(async (video, requestedTime) => {
         video.pause();
         const seeked = new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
         const latestSafeTime = Math.max(0, video.duration - 0.05);
         video.currentTime = Math.min(requestedTime, latestSafeTime);
         await seeked;
         return video.currentTime;
      }, run.loaderTime);
      await run.capture(page, 'loader-02-video-loaded', {
         page: 'loader.html',
         purpose: `The committed MP4 loaded at ${capturedTime.toFixed(3)} seconds with active controls.`,
         locator: '.loader-band--stage',
      });

      await page.locator('#recordFaceBtn').click();
      await page.locator('#loaderLog .loader-entry').first().waitFor({ state: 'visible' });
      await run.capture(page, 'loader-03-record-result', {
         page: 'loader.html',
         purpose: 'A frame-level Record face result with timestamped diagnostic metadata.',
         locator: '.loader-band--log',
      });
   } finally {
      await page.close();
   }
}

function writeOutputs(output, manifest) {
   fs.mkdirSync(output, { recursive: true });
   fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

   const lines = [
      '# Functional documentation screenshots',
      '',
      'Generated by `scripts-dev/capture-doc-screenshots.cjs`.',
      '',
      '| Screenshot | Page | Locale | Viewport | Pixels | Capture | Purpose |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...manifest.screenshots.map((entry) =>
         `| [${entry.id}](${entry.file}) | \`${entry.page}\` | ${entry.locale} | ${entry.viewport} | ${entry.widthPx}×${entry.heightPx} | ${entry.capture.kind} | ${entry.purpose} |`
      ),
      '',
   ];
   if (manifest.skipped.length) {
      lines.push('## Skipped optional captures', '');
      for (const entry of manifest.skipped) lines.push(`- \`${entry.id}\` (${entry.locale}/${entry.viewport}): ${entry.reason}`);
      lines.push('');
   }
   fs.writeFileSync(path.join(output, 'README.md'), `${lines.join('\n')}\n`);
}

async function main() {
   const options = parseArgs(process.argv.slice(2));
   assertFile(FAKE_CAMERA, 'Fake-camera fixture');
   if (options.only.includes('loader')) assertFile(LOADER_VIDEO, 'Loader fixture');

   const manifest = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      generator: 'scripts-dev/capture-doc-screenshots.cjs',
      output: relativeFromRoot(options.output),
      locales: options.locales,
      viewports: options.viewports,
      pageGroups: options.only,
      loaderTimestampSeconds: options.loaderTime,
      includeBrush: options.includeBrush,
      fixtures: {
         fakeCamera: relativeFromRoot(FAKE_CAMERA),
         loaderVideo: relativeFromRoot(LOADER_VIDEO),
      },
      screenshots: [],
      skipped: [],
      errors: [],
   };

   let server = null;
   let browser = null;
   try {
      server = options.baseUrl ? { baseUrl: options.baseUrl, close: async () => {} } : await startLocalServer();
      const executablePath = findSystemChrome();
      browser = await chromium.launch({
         headless: !options.headed,
         executablePath,
         args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${FAKE_CAMERA}`,
            '--autoplay-policy=no-user-gesture-required',
            '--use-angle=swiftshader',
            '--use-gl=angle',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
         ],
      });

      for (const locale of options.locales) {
         for (const viewport of options.viewports) {
            const context = await browser.newContext({
               viewport: VIEWPORTS[viewport],
               deviceScaleFactor: 1,
               isMobile: viewport === 'mobile',
               hasTouch: viewport === 'mobile',
               locale: locale === 'it' ? 'it-IT' : locale === 'pt' ? 'pt-PT' : 'en-GB',
               permissions: ['camera'],
               reducedMotion: 'reduce',
            });
            const capture = createRecorder({ output: options.output, locale, viewport, manifest });
            const run = {
               baseUrl: server.baseUrl,
               locale,
               viewport,
               loaderTime: options.loaderTime,
               includeBrush: options.includeBrush,
               capture,
               manifest,
            };

            for (const group of options.only) {
               try {
                  if (group === 'lab') await captureLab(context, run);
                  if (group === 'loader') await captureLoader(context, run);
               } catch (error) {
                  const failure = { group, locale, viewport, message: cleanErrorMessage(error) };
                  manifest.errors.push(failure);
                  process.stderr.write(`capture failed (${group}, ${locale}, ${viewport}): ${error.stack || error}\n`);
               }
            }
            await context.close();
         }
      }
   } catch (error) {
      manifest.errors.push({ group: 'bootstrap', locale: null, viewport: null, message: cleanErrorMessage(error) });
      throw error;
   } finally {
      if (browser) {
         try {
            await browser.close();
         } catch (error) {
            manifest.errors.push({ group: 'cleanup', locale: null, viewport: null, message: cleanErrorMessage(error) });
         }
      }
      if (server) {
         try {
            await server.close();
         } catch (error) {
            manifest.errors.push({ group: 'cleanup', locale: null, viewport: null, message: cleanErrorMessage(error) });
         }
      }
      writeOutputs(options.output, manifest);
   }

   process.stdout.write(`wrote ${manifest.screenshots.length} screenshots to ${options.output}\n`);
   if (manifest.errors.length) process.exitCode = 1;
}

main().catch((error) => {
   process.stderr.write(`${error.stack || error}\n`);
   process.exitCode = 1;
});
