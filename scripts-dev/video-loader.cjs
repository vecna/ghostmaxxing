#!/usr/bin/env node
/**
 * @file Seekable-video analysis CLI for Ghostmaxxing.
 * @description
 * Playwright drives loader.html through its public browser API. The CLI never
 * converts a source into a fake camera format and never creates a frame queue.
 * It writes editorial report artifacts separately from a versioned NDJSON
 * technical log that can later be replayed to extract short source clips.
 *
 * Usage:
 *   node scripts-dev/video-loader.cjs analyze video.webm --output analysis/video
 *   node scripts-dev/video-loader.cjs replay-log analysis.ndjson --output replay
 *   node scripts-dev/video-loader.cjs extract-clips analysis.ndjson video.webm
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const httpServer = require('http-server');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const FINGERPRINT_CHUNK_BYTES = 1024 * 1024;

/**
 * Prints command help.
 *
 * @returns {void}
 */
function usage() {
   process.stdout.write(`
Ghostmaxxing seekable-video analyser

Commands:
  analyze <video>             Analyse a local seekable video through loader.html
  replay-log <log>            Derive diagnostic JSON and an SVG timeline from a log
  extract-clips <log> <video> Extract event windows from the original source

Analyze options:
  --output <directory>        Output directory (default: video-analysis/<source>)
  --sample-interval <seconds> Lightweight sample interval (default: 0.5)
  --start <seconds>           First media timestamp (default: 0)
  --end <seconds>             Last media timestamp (default: source duration)
  --baseline-time <seconds>   Begin baseline search here, then scan full range
  --base-url <url>            Use an existing local server
  --headed                    Show Chromium while analysing
  --clips                     Extract clips after analysis
  --clip-before <seconds>     Clip pre-roll (default: 2)
  --clip-after <seconds>      Clip post-roll (default: 3)

Replay options:
  --output <directory>        Derived-artifact directory; no new log is written

Clip options:
  --output <directory>        Clip directory (default: <log directory>/clips)
  --clip-before <seconds>     Override logged pre-roll
  --clip-after <seconds>      Override logged post-roll

The source remains in place. Reports, selected JPEG frames, and analysis.ndjson
are written as separate artifacts.
`);
}

/**
 * Returns a required option value.
 *
 * @param {string[]} argv Argument vector.
 * @param {number} index Current option index.
 * @param {string} option Option name.
 * @returns {string} Following argument.
 */
function requireValue(argv, index, option) {
   const value = argv[index + 1];
   if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
   return value;
}

/**
 * Parses one finite non-negative numeric option.
 *
 * @param {string} value Raw value.
 * @param {string} option Option name.
 * @returns {number} Parsed number.
 */
function parseNumber(value, option) {
   const parsed = Number(value);
   if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${option} must be a non-negative number.`);
   return parsed;
}

/**
 * Produces a filesystem-safe source stem.
 *
 * @param {string} filename Source filename.
 * @returns {string} Safe stem.
 */
function safeStem(filename) {
   const stem = path.basename(filename, path.extname(filename));
   return stem.normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'video';
}

/**
 * Parses CLI options without introducing another command-line dependency.
 *
 * @param {string[]} argv User arguments excluding node and script path.
 * @returns {object} Parsed command options.
 */
function parseArgs(argv) {
   if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
      usage();
      process.exit(0);
   }
   const command = argv[0];
   if (!['analyze', 'replay-log', 'extract-clips'].includes(command)) {
      throw new Error(`Unknown command: ${command}`);
   }
   const positional = [];
   const options = {
      command,
      output: null,
      sampleIntervalSeconds: 0.5,
      start: 0,
      end: null,
      baselineTime: null,
      baseUrl: null,
      headed: false,
      clips: false,
      clipBefore: null,
      clipAfter: null,
   };

   for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index];
      if (!argument.startsWith('--')) {
         positional.push(argument);
         continue;
      }
      if (argument === '--headed') {
         options.headed = true;
         continue;
      }
      if (argument === '--clips') {
         options.clips = true;
         continue;
      }
      const value = requireValue(argv, index, argument);
      index += 1;
      if (argument === '--output') options.output = path.resolve(value);
      else if (argument === '--sample-interval') options.sampleIntervalSeconds = parseNumber(value, argument);
      else if (argument === '--start') options.start = parseNumber(value, argument);
      else if (argument === '--end') options.end = parseNumber(value, argument);
      else if (argument === '--baseline-time') options.baselineTime = parseNumber(value, argument);
      else if (argument === '--base-url') options.baseUrl = value.replace(/\/$/, '');
      else if (argument === '--clip-before') options.clipBefore = parseNumber(value, argument);
      else if (argument === '--clip-after') options.clipAfter = parseNumber(value, argument);
      else throw new Error(`Unknown option: ${argument}`);
   }
   options.positional = positional;
   return options;
}

/**
 * Validates one readable regular file.
 *
 * @param {string} input User path.
 * @param {string} label Diagnostic label.
 * @returns {string} Absolute path.
 */
function resolveFile(input, label) {
   if (!input) throw new Error(`${label} is required.`);
   const absolute = path.resolve(input);
   const stat = fs.statSync(absolute, { throwIfNoEntry: false });
   if (!stat?.isFile()) throw new Error(`${label} is not a readable file: ${absolute}`);
   return absolute;
}

/**
 * Computes a bounded provenance fingerprint for very large videos. The digest
 * includes file size plus the first and last MiB; it identifies the expected
 * source without spending minutes hashing multi-gigabyte recordings.
 *
 * @param {string} filename Absolute source path.
 * @returns {Promise<string>} Algorithm-labelled digest.
 */
async function sampledFingerprint(filename) {
   const handle = await fs.promises.open(filename, 'r');
   try {
      const stat = await handle.stat();
      const firstLength = Math.min(FINGERPRINT_CHUNK_BYTES, stat.size);
      const lastLength = Math.min(FINGERPRINT_CHUNK_BYTES, Math.max(0, stat.size - firstLength));
      const first = Buffer.alloc(firstLength);
      const last = Buffer.alloc(lastLength);
      if (firstLength) await handle.read(first, 0, firstLength, 0);
      if (lastLength) await handle.read(last, 0, lastLength, stat.size - lastLength);
      const digest = crypto.createHash('sha256')
         .update(String(stat.size))
         .update('\0')
         .update(first)
         .update(last)
         .digest('hex');
      return `sampled-sha256:${digest}`;
   } finally {
      await handle.close();
   }
}

/**
 * Starts a no-cache local server rooted at the repository.
 *
 * @returns {Promise<{baseUrl: string, close: Function}>} Server handle.
 */
async function startServer() {
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

/**
 * Decodes a browser-exported data URL.
 *
 * @param {string} dataUrl Data URL.
 * @returns {Buffer} Decoded bytes.
 */
function decodeDataUrl(dataUrl) {
   const separator = dataUrl.indexOf(',');
   if (separator < 0) throw new Error('Invalid frame data URL.');
   return Buffer.from(dataUrl.slice(separator + 1), 'base64');
}

/**
 * Escapes untrusted report text for standalone HTML output.
 *
 * @param {*} value Value to render.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(value) {
   return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
}

/**
 * Formats seconds for report headings and clip filenames.
 *
 * @param {number} seconds Media timestamp.
 * @returns {string} Compact timestamp.
 */
function formatTime(seconds) {
   const hours = Math.floor(seconds / 3600);
   const minutes = Math.floor((seconds % 3600) / 60);
   const rest = seconds % 60;
   return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}

/**
 * Describes an automatic or person-requested event without claiming that
 * makeup caused it.
 * A person's edited caption always replaces this classification-specific
 * fallback in the portable report.
 *
 * @param {object} event Report event.
 * @param {number} threshold Active face-api descriptor threshold.
 * @returns {string} Conservative default report caption.
 */
function defaultEventCaption(event, threshold) {
   if (event.classification === 'manual-frame-check') {
      const evidence = event.evidence?.at(-1);
      if (event.interpretation === 'above-threshold') {
         return `A person requested this comparison. Its face-api distance ${Number(evidence?.faceDistance).toFixed(4)} is at or above the ${threshold} threshold; this is one explicit check, not a repeated automatic transition.`;
      }
      if (event.interpretation === 'below-threshold') {
         return `A person requested this comparison. Its face-api distance ${Number(evidence?.faceDistance).toFixed(4)} is below the ${threshold} threshold.`;
      }
      if (event.interpretation === 'no-2d-face') {
         return 'A person requested this comparison. MediaPipe retained a comparable crop, but face-api returned no 2D face.';
      }
      return 'A person requested this comparison, but the frame did not meet MediaPipe comparability limits. Any face-api result is diagnostic context only.';
   }
   if (event.classification === 'identity-distance') {
      return `Repeated comparable frames returned face-api descriptor distances at or above ${threshold}.`;
   }
   if (event.classification === 'detector-divergence') {
      return 'MediaPipe retained a comparable face mesh while face-api returned no 2D face in repeated checks. Review pose and occlusion before attributing this to makeup.';
   }
   return 'Different model checks diverged in this interval. Review the selected frame and source clip before interpreting the result.';
}

/**
 * Parses a newline-delimited technical log from memory.
 *
 * @param {string} contents NDJSON document.
 * @param {string} sourceLabel Human-readable source used in parse errors.
 * @returns {object[]} Parsed records.
 */
function parseTechnicalLog(contents, sourceLabel) {
   return contents
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
         try {
            return JSON.parse(line);
         } catch (error) {
            throw new Error(`Invalid JSON on ${sourceLabel}:${index + 1}: ${error.message}`);
         }
      });
}

/**
 * Renders the three analysis signals as a scalable report artifact. Missing
 * face-api detections use an × marker rather than a fabricated numeric L2
 * value, and numeric distances receive a data-aware vertical scale.
 *
 * @param {object[]} records Parsed technical-log records.
 * @returns {string} Standalone SVG document.
 */
function renderTimelineSvg(records) {
   const header = records.find((record) => record.type === 'analysis-header');
   if (!header) throw new Error('Technical log has no analysis-header record.');
   const samples = records
      .filter((record) => record.type === 'sample' && record.phase === 'scan')
      .sort((left, right) => left.mediaTime - right.mediaTime);
   const faceEntries = records
      .filter((record) => record.type === 'face-api-result')
      .sort((left, right) => left.mediaTime - right.mediaTime);
   const width = 1160;
   const height = 230;
   const left = 150;
   const right = 18;
   const plotWidth = width - left - right;
   const rangeStart = header.config?.analysisRange?.start ?? 0;
   const rangeEnd = header.config?.analysisRange?.end ?? header.source?.duration ?? 1;
   const duration = Math.max(0.001, rangeEnd - rangeStart);
   const x = (mediaTime) => left + ((mediaTime - rangeStart) / duration) * plotWidth;
   const lanes = {
      coverage: { top: 18, height: 34, label: 'MediaPipe coverage' },
      drift: { top: 74, height: 50, label: 'ImageEmbedder drift' },
      face: { top: 146, height: 48, label: 'face-api L2' },
   };
   const visualThreshold = header.baseline?.visualTriggerThreshold ?? 0.1;
   const driftValues = samples.map((sample) => sample.visualDrift).filter(Number.isFinite);
   const driftMax = Math.max(0.1, visualThreshold * 3, ...driftValues);
   const faceThreshold = header.config?.faceDistanceThreshold ?? 0.6;
   const faceValues = faceEntries.map((entry) => entry.faceDistance).filter(Number.isFinite);
   const faceMax = Math.max(0.8, faceThreshold * 1.25, ...faceValues.map((value) => value * 1.1));
   const coveragePoints = samples.map((sample) => {
      const y = lanes.coverage.top + (sample.comparable
         ? 7
         : sample.facePresent ? lanes.coverage.height / 2 : lanes.coverage.height - 7);
      return `${x(sample.mediaTime).toFixed(2)},${y.toFixed(2)}`;
   }).join(' ');
   const coverageDots = samples.map((sample) => {
      const y = lanes.coverage.top + (sample.comparable
         ? 7
         : sample.facePresent ? lanes.coverage.height / 2 : lanes.coverage.height - 7);
      const fill = sample.comparable ? '#7fe3b0' : sample.facePresent ? '#f3c747' : '#756b60';
      return `<circle cx="${x(sample.mediaTime).toFixed(2)}" cy="${y.toFixed(2)}" r="2.25" fill="${fill}"/>`;
   }).join('');
   const driftSegments = [];
   let currentSegment = [];
   for (const sample of samples) {
      if (!Number.isFinite(sample.visualDrift)) {
         if (currentSegment.length) driftSegments.push(currentSegment);
         currentSegment = [];
         continue;
      }
      const y = lanes.drift.top + lanes.drift.height - (sample.visualDrift / driftMax) * lanes.drift.height;
      currentSegment.push(`${x(sample.mediaTime).toFixed(2)},${y.toFixed(2)}`);
   }
   if (currentSegment.length) driftSegments.push(currentSegment);
   const driftLines = driftSegments
      .map((points) => `<polyline points="${points.join(' ')}" fill="none" stroke="#f3c747" stroke-width="2"/>`)
      .join('');
   const driftThresholdY = lanes.drift.top + lanes.drift.height
      - (visualThreshold / driftMax) * lanes.drift.height;
   const faceMarks = faceEntries.map((entry) => {
      const px = x(entry.mediaTime);
      if (Number.isFinite(entry.faceDistance)) {
         const py = lanes.face.top + lanes.face.height - (entry.faceDistance / faceMax) * lanes.face.height;
         return `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="3.5" fill="#ff8e72"/>`;
      }
      const py = lanes.face.top + 7;
      return `<path d="M ${(px - 3).toFixed(2)} ${py - 3} L ${(px + 3).toFixed(2)} ${py + 3} M ${(px + 3).toFixed(2)} ${py - 3} L ${(px - 3).toFixed(2)} ${py + 3}" fill="none" stroke="#ff8e72" stroke-width="1.6"/>`;
   }).join('');
   const faceThresholdY = lanes.face.top + lanes.face.height
      - (faceThreshold / faceMax) * lanes.face.height;
   const laneMarkup = Object.values(lanes).map((lane) => `
      <text class="lane-label" x="10" y="${lane.top + lane.height / 2}">${lane.label}</text>
      <rect class="lane" x="${left}" y="${lane.top}" width="${plotWidth}" height="${lane.height}"/>`).join('');

   return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="timeline-title timeline-desc">
   <title id="timeline-title">Video analysis timeline</title>
   <desc id="timeline-desc">MediaPipe coverage, generic ImageEmbedder drift, and sparse face-api descriptor distances. Crosses mean face-api returned no two-dimensional face.</desc>
   <style>
      .bg{fill:#17130f}.lane{fill:none;stroke:rgba(255,231,168,.12)}
      text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:#b8aa96}
      .lane-label{font-size:11px;font-weight:700;dominant-baseline:middle}
      .note{font-size:9px;font-weight:700}.time{font-size:10px}
   </style>
   <rect class="bg" width="${width}" height="${height}"/>
   ${laneMarkup}
   ${coveragePoints ? `<polyline points="${coveragePoints}" fill="none" stroke="#7fe3b0" stroke-width="2"/>${coverageDots}` : ''}
   ${driftLines}
   <line x1="${left}" y1="${driftThresholdY}" x2="${left + plotWidth}" y2="${driftThresholdY}" stroke="rgba(243,199,71,.65)" stroke-dasharray="4 4"/>
   ${faceMarks}
   <line x1="${left}" y1="${faceThresholdY}" x2="${left + plotWidth}" y2="${faceThresholdY}" stroke="rgba(255,142,114,.7)" stroke-dasharray="4 4"/>
   <text class="note" x="${left + 6}" y="${lanes.coverage.top + 11}">high usable · middle mesh only · low absent</text>
   <text class="note" x="${left + plotWidth - 6}" y="${driftThresholdY - 7}" text-anchor="end">trigger ${visualThreshold.toFixed(4)}</text>
   <text class="note" x="${left + plotWidth - 6}" y="${faceThresholdY - 7}" text-anchor="end">× no 2D face</text>
   <text class="note" x="${left + plotWidth - 6}" y="${faceThresholdY + 12}" text-anchor="end">threshold ${faceThreshold.toFixed(4)}</text>
   <text class="time" x="${left}" y="218">${escapeHtml(formatTime(rangeStart))}</text>
   <text class="time" x="${left + plotWidth}" y="218" text-anchor="end">${escapeHtml(formatTime(rangeEnd))}</text>
</svg>`;
}

/**
 * Renders a portable report that references separately written JPEG evidence.
 *
 * @param {object} report Browser report model.
 * @param {Map<string, string>} frameFiles Artifact ID to relative filename.
 * @param {string|null} timelineFile Relative timeline artifact filename.
 * @returns {string} Standalone HTML.
 */
function renderReportHtml(report, frameFiles, timelineFile = null) {
   const baseline = frameFiles.get('baseline');
   const eventMarkup = new Map(report.events.map((event) => {
      const image = frameFiles.get(event.id);
      const evidence = event.evidence.at(-1) || {};
      const eventLabel = event.promoted
         ? 'Selected story moment'
         : event.classification === 'manual-frame-check'
            ? 'Manual frame check'
            : event.classification === 'identity-distance'
               ? 'Identity-distance transition'
               : event.classification === 'detector-divergence'
                  ? 'Detector divergence — review'
                  : 'Mixed transition — review';
      return [event.id, `<article class="event">
        ${image ? `<img src="${escapeHtml(image)}" alt="Selected frame at ${escapeHtml(formatTime(event.anchorMediaTime))}">` : ''}
        <div>
          <p class="kicker">${eventLabel}</p>
          <h2>${escapeHtml(formatTime(event.anchorMediaTime))}</h2>
          <p>${escapeHtml(event.caption || defaultEventCaption(event, report.config.faceDistanceThreshold))}</p>
          <dl>
            <dt>face-api distance</dt><dd>${evidence.faceDistance == null ? 'no face returned' : Number(evidence.faceDistance).toFixed(4)}</dd>
            <dt>ImageEmbedder drift</dt><dd>${evidence.visualDrift == null ? 'n/a' : Number(evidence.visualDrift).toFixed(4)}</dd>
            <dt>clip window</dt><dd>${escapeHtml(formatTime(event.recommendedClip.start))}–${escapeHtml(formatTime(event.recommendedClip.end))}</dd>
          </dl>
        </div>
      </article>`];
   }));
   const baselineVariationWarning = report.baseline?.faceSpread
      > (report.config.maximumBaselineFaceSpread ?? 0.3)
      ? '<p class="warning">The selected baseline has elevated face-api variation. Treat distances near the decision threshold as review evidence.</p>'
      : '';
   const baselineMarkup = baseline ? `<article class="event reference">
      <img src="${escapeHtml(baseline)}" alt="Computational reference frame at ${escapeHtml(formatTime(report.baseline.mediaTime))}">
      <div><p class="kicker">Baseline · distance reference</p>
      <h2>Baseline · ${escapeHtml(formatTime(report.baseline.mediaTime))}</h2>
      <p>This source frame anchors the reported distances and remains the first story entry. Its timestamp and computational role do not change.</p>
      ${baselineVariationWarning}
      <dl>
        <dt>ImageEmbedder trigger</dt><dd>${Number(report.baseline.visualTriggerThreshold).toFixed(4)}</dd>
        <dt>face-api baseline spread</dt><dd>${Number(report.baseline.faceSpread).toFixed(4)}</dd>
        <dt>face-api decision threshold</dt><dd>${Number(report.config.faceDistanceThreshold).toFixed(4)}</dd>
      </dl></div>
   </article>` : '';
   const storyMarkup = (report.storyOrder || ['baseline', ...report.events.map((event) => event.id)])
      .map((id) => id === 'baseline' ? baselineMarkup : eventMarkup.get(id) || '')
      .filter(Boolean)
      .join('\n');
   const timelineMarkup = timelineFile ? `<figure class="timeline">
      <img src="${escapeHtml(timelineFile)}" alt="Timeline of MediaPipe coverage, ImageEmbedder drift, and sparse face-api checks">
      <figcaption>MediaPipe coverage is context only. ImageEmbedder drift is generic image change measured as 1 − cosine similarity. face-api circles are numeric L2 distances; × means no 2D face was returned.</figcaption>
   </figure>` : '';

   return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ghostmaxxing video analysis — ${escapeHtml(report.source.name)}</title>
<style>
body{margin:0;background:#f26a1b;color:#0a0a08;font:17px/1.5 system-ui,sans-serif}main{width:min(1100px,calc(100% - 2rem));margin:auto;padding:3rem 0}h1,h2{font-family:Georgia,serif;line-height:1}.meta,.event,.timeline{border:2px solid #0a0a08;background:#fff1cf}.meta{padding:1rem}.timeline{margin:1.5rem 0}.timeline img{display:block;width:100%;height:auto;background:#17130f}.timeline figcaption{padding:.8rem 1rem;border-top:2px solid #0a0a08;font-size:.82rem}.event{display:grid;grid-template-columns:minmax(260px,1fr) 1fr;margin:1.5rem 0}.event.reference{border-color:#0b4a3c}.event img{width:100%;height:100%;object-fit:contain;background:#050505}.event>div{padding:1.25rem}.warning{padding:.65rem .75rem;border-left:.3rem solid #a54b14;background:rgba(243,199,71,.22);font-weight:750}.kicker,dt{font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0b4a3c}dd{margin:0 0 .6rem}@media(max-width:700px){.event{grid-template-columns:1fr}}
</style></head><body><main>
<p class="kicker">Ghostmaxxing · seekable video report</p>
<h1>${escapeHtml(report.source.name)}</h1>
<div class="meta">${report.summary.sampledFrames} samples · ${report.summary.faceApiRuns} face-api checks · ${report.summary.confirmedEvents} confirmed events · ${report.summary.manualChecks || 0} manual checks · threshold ${escapeHtml(report.config.faceDistanceThreshold)}</div>
<p>Story order is editorial. Every card retains its original source timestamp.</p>
${timelineMarkup}
${storyMarkup || '<p>No event passed the confirmation policy.</p>'}
</main></body></html>`;
}

/**
 * Writes report JSON, portable HTML, selected JPEGs, and the separate log.
 *
 * @param {string} outputDirectory Destination directory.
 * @param {{report: object, technicalLog: string, frames: object[]}} bundle Browser export bundle.
 * @returns {Promise<{logFile: string, reportFile: string, timelineFile: string}>} Key output paths.
 */
async function writeBundle(outputDirectory, bundle) {
   const framesDirectory = path.join(outputDirectory, 'frames');
   await fs.promises.mkdir(framesDirectory, { recursive: true });
   const frameFiles = new Map();
   for (const frame of bundle.frames) {
      const filename = `${frame.id === 'baseline' ? 'baseline' : safeStem(frame.id)}-${frame.mediaTime.toFixed(3)}.jpg`;
      const absolute = path.join(framesDirectory, filename);
      await fs.promises.writeFile(absolute, decodeDataUrl(frame.dataUrl));
      frameFiles.set(frame.id, `frames/${filename}`);
   }
   const logFile = path.join(outputDirectory, 'analysis.ndjson');
   const reportFile = path.join(outputDirectory, 'report.json');
   const timelineName = 'timeline.svg';
   const timelineFile = path.join(outputDirectory, timelineName);
   const timeline = renderTimelineSvg(parseTechnicalLog(bundle.technicalLog, 'browser export'));
   const report = {
      ...bundle.report,
      artifacts: {
         timeline: timelineName,
         frames: Object.fromEntries(frameFiles),
      },
   };
   await Promise.all([
      fs.promises.writeFile(logFile, bundle.technicalLog),
      fs.promises.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`),
      fs.promises.writeFile(timelineFile, timeline),
      fs.promises.writeFile(path.join(outputDirectory, 'report.html'), renderReportHtml(report, frameFiles, timelineName)),
   ]);
   return { logFile, reportFile, timelineFile };
}

/**
 * Reads an NDJSON technical log and returns parsed records.
 *
 * @param {string} logFile Absolute log path.
 * @returns {object[]} Records.
 */
function readTechnicalLog(logFile) {
   return parseTechnicalLog(fs.readFileSync(logFile, 'utf8'), logFile);
}

/**
 * Extracts event clips from the original media using logged media timestamps.
 *
 * @param {string} logFile Technical log.
 * @param {string} sourceVideo Original source.
 * @param {object} options Clip options.
 * @returns {Promise<string[]>} Written clip paths.
 */
async function extractClips(logFile, sourceVideo, options) {
   const records = readTechnicalLog(logFile);
   const header = records.find((record) => record.type === 'analysis-header');
   const events = records.filter((record) => record.type === 'evidence-event' && record.status === 'confirmed');
   if (!header) throw new Error('Technical log has no analysis-header record.');
   const sourceStat = fs.statSync(sourceVideo);
   if (header.source?.size != null && header.source.size !== sourceStat.size) {
      throw new Error('Source size does not match the video recorded in the technical log.');
   }
   if (header.source?.fingerprint) {
      const fingerprint = await sampledFingerprint(sourceVideo);
      if (fingerprint !== header.source.fingerprint) {
         throw new Error('Source fingerprint does not match the video recorded in the technical log.');
      }
   }
   const outputDirectory = options.output || path.join(path.dirname(logFile), 'clips');
   fs.mkdirSync(outputDirectory, { recursive: true });
   const written = [];
   events.forEach((event, index) => {
      const start = options.clipBefore == null
         ? event.recommendedClip.start
         : Math.max(0, event.anchorMediaTime - options.clipBefore);
      const end = options.clipAfter == null
         ? event.recommendedClip.end
         : event.anchorMediaTime + options.clipAfter;
      const duration = Math.max(0.1, end - start);
      const filename = path.join(outputDirectory, `event-${String(index + 1).padStart(3, '0')}-${event.anchorMediaTime.toFixed(3)}.mp4`);
      const result = childProcess.spawnSync('ffmpeg', [
         '-hide_banner', '-loglevel', 'error', '-y',
         '-ss', String(start), '-i', sourceVideo, '-t', String(duration),
         '-map', '0:v:0', '-map', '0:a?',
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
         '-c:a', 'aac', '-movflags', '+faststart', filename,
      ], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`ffmpeg failed while writing ${filename}`);
      written.push(filename);
   });
   return written;
}

/**
 * Analyses a video through the real loader page.
 *
 * @param {object} options Parsed options.
 * @returns {Promise<void>}
 */
async function analyze(options) {
   const source = resolveFile(options.positional[0], 'Source video');
   const output = options.output || path.join(ROOT, 'video-analysis', safeStem(source));
   await fs.promises.mkdir(output, { recursive: true });
   const fingerprint = await sampledFingerprint(source);
   const localServer = options.baseUrl ? null : await startServer();
   const baseUrl = options.baseUrl || localServer.baseUrl;
   const browser = await chromium.launch({ headless: !options.headed });

   try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      page.on('console', (message) => {
         if (message.type() === 'error') process.stderr.write(`[browser] ${message.text()}\n`);
      });
      process.stdout.write(`Opening ${baseUrl}/loader.html\n`);
      await page.goto(`${baseUrl}/loader.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.gstmxxVideoLoader?.isModelsReady(), null, { timeout: 120000 });
      await page.evaluate((value) => window.gstmxxVideoLoader.setSourceMetadata({ fingerprint: value }), fingerprint);
      await page.setInputFiles('#videoFile', source);
      await page.waitForFunction(() => window.gstmxxVideoLoader?.isSourceLoaded(), null, { timeout: 30000 });
      process.stdout.write(`Analysing ${source}\n`);
      let analysisError = null;
      try {
         await page.evaluate(async (analysisOptions) => {
            await window.gstmxxVideoLoader.analyze(analysisOptions);
         }, {
            start: options.start,
            end: options.end,
            baselineTime: options.baselineTime,
            sampleIntervalSeconds: options.sampleIntervalSeconds,
         });
      } catch (error) {
         analysisError = error;
      }
      const bundle = await page.evaluate(() => window.gstmxxVideoLoader.exportBundle());
      const outputs = await writeBundle(output, bundle);
      process.stdout.write(`Report: ${outputs.reportFile}\nTimeline: ${outputs.timelineFile}\nTechnical log: ${outputs.logFile}\n`);
      if (analysisError) {
         throw new Error(`Browser analysis failed; diagnostic artifacts were preserved in ${output}: ${analysisError.message}`);
      }
      if (options.clips) {
         const clips = await extractClips(outputs.logFile, source, {
            output: path.join(output, 'clips'),
            clipBefore: options.clipBefore ?? 2,
            clipAfter: options.clipAfter ?? 3,
         });
         process.stdout.write(`Clips: ${clips.length}\n`);
      }
   } finally {
      await browser.close();
      if (localServer) await localServer.close();
   }
}

/**
 * Rebuilds a diagnostic JSON projection and timeline from the independent
 * technical log. It never writes another NDJSON log or reruns model inference.
 *
 * @param {object} options Parsed options.
 * @returns {Promise<void>}
 */
async function replayLog(options) {
   const logFile = resolveFile(options.positional[0], 'Technical log');
   const records = readTechnicalLog(logFile);
   const header = records.find((record) => record.type === 'analysis-header');
   const footer = records.find((record) => record.type === 'analysis-footer');
   const events = records.filter((record) => record.type === 'evidence-event');
   if (!header || !footer) throw new Error('Technical log is missing its header or footer.');
   const output = options.output || path.join(path.dirname(logFile), 'replayed');
   await fs.promises.mkdir(output, { recursive: true });
   const timelineName = 'timeline.svg';
   const report = {
      schemaVersion: header.schemaVersion,
      sessionId: header.sessionId,
      createdAt: header.createdAt,
      source: header.source,
      config: header.config,
      models: header.models,
      baseline: header.baseline,
      summary: footer.summary,
      storyOrder: footer.storyOrder || [],
      events,
      replayedFrom: logFile,
      artifacts: { timeline: timelineName },
   };
   await Promise.all([
      fs.promises.writeFile(path.join(output, 'report.replayed.json'), `${JSON.stringify(report, null, 2)}\n`),
      fs.promises.writeFile(path.join(output, timelineName), renderTimelineSvg(records)),
   ]);
   process.stdout.write(`Replayed report: ${path.join(output, 'report.replayed.json')}\n`);
   process.stdout.write(`Replayed timeline: ${path.join(output, timelineName)}\n`);
}

/**
 * Runs the selected command and reports actionable errors.
 *
 * @returns {Promise<void>}
 */
async function main() {
   const options = parseArgs(process.argv.slice(2));
   if (options.command === 'analyze') await analyze(options);
   else if (options.command === 'replay-log') await replayLog(options);
   else {
      const logFile = resolveFile(options.positional[0], 'Technical log');
      const source = resolveFile(options.positional[1], 'Source video');
      const clips = await extractClips(logFile, source, options);
      process.stdout.write(`Extracted ${clips.length} clip(s).\n`);
   }
}

main().catch((error) => {
   process.stderr.write(`video-loader: ${error.stack || error.message || String(error)}\n`);
   process.exitCode = 1;
});
