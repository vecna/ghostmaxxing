/**
 * @module realtime-capture
 * @description
 * Everything that decides whether a frame is good enough to believe.
 *
 * The baseline is captured once and every number for the rest of the session
 * is measured against it, so it is worth being slow and picky about. The
 * prototype took the first frame that returned a descriptor — no confidence
 * check, no framing check, no pose check — which meant a blurred half-turned
 * frame could silently become the reference for an hour of work.
 *
 * The same gate is reused for spike captures, for the same reason: a single
 * frame at 0.50 is as likely to be motion blur as a result, and "the makeup is
 * working" is not a claim you want resting on a photo of someone moving.
 */

/** Landmark indices in face-api's 68-point model. */
const LM_LEFT_EYE_OUTER = 36;
const LM_RIGHT_EYE_OUTER = 45;
const LM_NOSE_TIP = 30;

const DEFAULT_GATE = {
  minScore: 0.9,
  minBoxWidthRatio: 0.25,
  edgeMarginRatio: 0.02,
  maxRollDegrees: 8,
  maxYawOffset: 0.12,
  minLuma: 0.18,
  maxLuma: 0.86,
  maxClippedRatio: 0.02,
};

/**
 * Euclidean distance between two descriptors.
 *
 * Kept local rather than reaching for the global `faceapi` so this module can
 * be imported and unit tested without the vendor bundle present.
 *
 * @param {Float32Array|number[]} a First descriptor.
 * @param {Float32Array|number[]} b Second descriptor.
 * @returns {number} Euclidean distance.
 */
export function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Picks the medoid of a descriptor set and reports its spread.
 *
 * The medoid — the member with the smallest summed distance to the others — is
 * used rather than the mean because it stays a real point in the embedding.
 * Averaging near-unit vectors that are not perfectly aligned yields something
 * slightly shorter than its inputs, which bakes a small systematic offset into
 * every distance measured for the rest of the session.
 *
 * The returned spread is the session's NOISE FLOOR: how far the descriptor
 * moves when nothing about the face has changed. It is the only empirical
 * reference line this tool draws.
 *
 * @param {Array<Float32Array|number[]>} descriptors Collected descriptors.
 * @returns {{descriptor: number[], spread: number, index: number}} Medoid result.
 */
export function medoid(descriptors) {
  if (!descriptors.length) throw new Error('medoid() needs at least one descriptor');
  if (descriptors.length === 1) {
    return { descriptor: Array.from(descriptors[0]), spread: 0, index: 0 };
  }

  const n = descriptors.length;
  const matrix = Array.from({ length: n }, () => new Float64Array(n));

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = euclidean(descriptors[i], descriptors[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }

  let bestIndex = 0;
  let bestSum = Infinity;
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += matrix[i][j];
    if (sum < bestSum) {
      bestSum = sum;
      bestIndex = i;
    }
  }

  const spread = bestSum / (n - 1);
  return { descriptor: Array.from(descriptors[bestIndex]), spread, index: bestIndex };
}

/**
 * Creates a reusable scratch canvas for crop analysis.
 *
 * @param {number} size Square edge length in pixels.
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}} Scratch surface.
 */
function createScratch(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

/**
 * Measures relative sharpness and exposure of a face crop.
 *
 * Sharpness is gradient energy and is used only for RANKING candidates against
 * each other, never against a fixed floor — an absolute threshold would be one
 * more magic number that varies with every camera and lighting setup.
 *
 * @param {HTMLVideoElement} video Source video element.
 * @param {{x: number, y: number, width: number, height: number}} box Face box in video pixels.
 * @param {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}} scratch Scratch surface.
 * @returns {{sharpness: number, luma: number, clipped: number}} Crop statistics.
 */
function analyseCrop(video, box, scratch) {
  const size = scratch.canvas.width;
  scratch.ctx.drawImage(
    video,
    Math.max(0, box.x),
    Math.max(0, box.y),
    Math.max(1, box.width),
    Math.max(1, box.height),
    0,
    0,
    size,
    size,
  );

  const { data } = scratch.ctx.getImageData(0, 0, size, size);
  const gray = new Float32Array(size * size);
  let lumaSum = 0;
  let clipped = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    gray[p] = value;
    lumaSum += value;
    if (value > 0.98) clipped += 1;
  }

  let energy = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const idx = y * size + x;
      const gx = gray[idx + 1] - gray[idx - 1];
      const gy = gray[idx + size] - gray[idx - size];
      energy += gx * gx + gy * gy;
    }
  }

  const pixels = size * size;
  return {
    sharpness: energy / pixels,
    luma: lumaSum / pixels,
    clipped: clipped / pixels,
  };
}

/**
 * Creates the frame quality gate.
 *
 * @param {HTMLVideoElement} video Source video element.
 * @param {object} [overrides] Partial gate threshold overrides.
 * @returns {{evaluate: Function}} Quality gate.
 */
export function createQualityGate(video, overrides = {}) {
  const limits = { ...DEFAULT_GATE, ...overrides };
  const scratch = createScratch(96);

  return {
    /**
     * Judges one detection against every framing and quality rule.
     *
     * @param {*} detection face-api detection with landmarks and descriptor.
     * @returns {{ok: boolean, reason: string, sharpness: number}} Verdict.
     */
    evaluate(detection) {
      const reject = (reason) => ({ ok: false, reason, sharpness: 0 });

      const box = detection?.detection?.box;
      const score = detection?.detection?.score ?? 0;
      const points = detection?.landmarks?.positions;
      if (!box || !points) return reject('No usable detection.');

      const videoW = video.videoWidth || 1;
      const videoH = video.videoHeight || 1;

      if (score < limits.minScore) return reject('Low confidence — improve the lighting.');
      if (box.width < videoW * limits.minBoxWidthRatio) return reject('Move closer to the camera.');

      const marginX = videoW * limits.edgeMarginRatio;
      const marginY = videoH * limits.edgeMarginRatio;
      const clipsFrame =
        box.x < marginX ||
        box.y < marginY ||
        box.x + box.width > videoW - marginX ||
        box.y + box.height > videoH - marginY;
      if (clipsFrame) return reject('Centre your face in the frame.');

      const leftEye = points[LM_LEFT_EYE_OUTER];
      const rightEye = points[LM_RIGHT_EYE_OUTER];
      const nose = points[LM_NOSE_TIP];
      if (!leftEye || !rightEye || !nose) return reject('Landmarks incomplete.');

      const rollDegrees = Math.abs(
        (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI,
      );
      if (rollDegrees > limits.maxRollDegrees) return reject('Level your head.');

      const interocular = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 1;
      const eyeMidX = (leftEye.x + rightEye.x) / 2;
      const yawOffset = Math.abs(nose.x - eyeMidX) / interocular;
      if (yawOffset > limits.maxYawOffset) return reject('Look straight at the camera.');

      const crop = analyseCrop(video, box, scratch);
      if (crop.luma < limits.minLuma) return reject('Too dark — add some light.');
      if (crop.luma > limits.maxLuma || crop.clipped > limits.maxClippedRatio) {
        return reject('Overexposed — reduce the light.');
      }

      return { ok: true, reason: '', sharpness: crop.sharpness };
    },
  };
}

/**
 * Creates the baseline collector.
 *
 * Progress advances on ACCEPTED samples only, never on elapsed time. A stalled
 * ring means frames are being rejected, and the reason is reported alongside —
 * so the control diagnoses itself instead of silently timing out.
 *
 * @param {object} options Collector options.
 * @param {number} options.targetSamples Accepted samples required.
 * @param {number} options.minDurationMs Floor on capture duration.
 * @param {number} options.timeoutMs Abandon threshold.
 * @param {number} options.maxSpread Largest acceptable noise floor.
 * @returns {object} Baseline collector.
 */
export function createBaselineCollector(options) {
  const { targetSamples, minDurationMs, timeoutMs, maxSpread } = options;

  let descriptors = [];
  let startedAt = 0;
  let active = false;

  return {
    /**
     * Begins a fresh collection run.
     *
     * @returns {void}
     */
    start() {
      descriptors = [];
      startedAt = Date.now();
      active = true;
    },

    /**
     * Ends the current run without producing a baseline.
     *
     * @returns {void}
     */
    cancel() {
      active = false;
      descriptors = [];
    },

    /**
     * Reports whether a run is in progress.
     *
     * @returns {boolean} True while collecting.
     */
    isActive() {
      return active;
    },

    /**
     * Offers one gated frame to the collector.
     *
     * @param {{ok: boolean, reason: string}} verdict Quality gate verdict.
     * @param {Float32Array|number[]} descriptor Descriptor for the frame.
     * @returns {{status: string, accepted: number, target: number, reason?: string, baseline?: object}} Progress.
     */
    offer(verdict, descriptor) {
      if (!active) return { status: 'idle', accepted: 0, target: targetSamples };

      const elapsed = Date.now() - startedAt;

      if (!verdict.ok) {
        if (elapsed > timeoutMs) {
          active = false;
          return {
            status: 'failed',
            accepted: descriptors.length,
            target: targetSamples,
            reason: verdict.reason,
          };
        }
        return {
          status: 'blocked',
          accepted: descriptors.length,
          target: targetSamples,
          reason: verdict.reason,
        };
      }

      if (descriptors.length < targetSamples) descriptors.push(Array.from(descriptor));

      const enoughSamples = descriptors.length >= targetSamples;
      const enoughTime = elapsed >= minDurationMs;

      if (!enoughSamples || !enoughTime) {
        return { status: 'collecting', accepted: descriptors.length, target: targetSamples };
      }

      const result = medoid(descriptors);
      active = false;

      // A spread this wide means the subject moved or the lighting flickered
      // during collection. Accepting it would set a noise floor so high that
      // real results disappear underneath it.
      if (result.spread > maxSpread) {
        return {
          status: 'failed',
          accepted: descriptors.length,
          target: targetSamples,
          reason: 'Too much movement during capture.',
        };
      }

      return {
        status: 'done',
        accepted: descriptors.length,
        target: targetSamples,
        baseline: {
          descriptor: result.descriptor,
          noiseFloor: result.spread,
          capturedAt: Date.now(),
          samples: descriptors.length,
        },
      };
    },
  };
}

/**
 * Creates the sustained-spike detector.
 *
 * Capture triggers on a reading that HOLDS, not on an instantaneous value, and
 * the frame written to disk is the sharpest one observed across the sustain
 * window rather than whichever frame happened to trip the trigger.
 *
 * Two conditions fire a capture:
 *   personal best — a new session maximum by a real margin, which is what you
 *                   iterate against between makeup passes
 *   crossing      — the first time the run clears the cited match threshold
 *
 * @param {object} options Detector options.
 * @param {number} options.sustainMs Time a reading must hold.
 * @param {number} options.bestMargin Margin over the session best.
 * @param {number} options.threshold Cited match threshold.
 * @param {number} options.cooldownMs Minimum spacing between captures.
 * @returns {object} Spike detector.
 */
export function createSpikeDetector(options) {
  const { sustainMs, bestMargin, threshold, cooldownMs } = options;

  let sessionBest = 0;
  let crossedThreshold = false;
  let runStartedAt = 0;
  let runValueFloor = 0;
  let lastCaptureAt = 0;

  return {
    /**
     * Clears session state after a new baseline is set.
     *
     * @returns {void}
     */
    reset() {
      sessionBest = 0;
      crossedThreshold = false;
      runStartedAt = 0;
      runValueFloor = 0;
      lastCaptureAt = 0;
    },

    /**
     * Marks a capture as taken so the cooldown applies.
     *
     * @param {number} value Distance at capture time.
     * @returns {void}
     */
    noteCapture(value) {
      lastCaptureAt = Date.now();
      sessionBest = Math.max(sessionBest, value);
      if (value >= threshold) crossedThreshold = true;
      runStartedAt = 0;
    },

    /**
     * Feeds one live distance reading to the detector.
     *
     * @param {number} value Live distance for this frame.
     * @returns {{capture: boolean, kind: string, candidate: boolean}} Verdict.
     */
    update(value) {
      const now = Date.now();
      const beatsBest = value >= sessionBest + bestMargin;
      const crosses = !crossedThreshold && value >= threshold;
      const interesting = beatsBest || crosses;

      if (!interesting) {
        runStartedAt = 0;
        return { capture: false, kind: '', candidate: false };
      }

      if (!runStartedAt) {
        runStartedAt = now;
        runValueFloor = value;
        return { capture: false, kind: '', candidate: true };
      }

      // A dip below where the run started means the reading did not hold.
      if (value < runValueFloor - bestMargin) {
        runStartedAt = 0;
        return { capture: false, kind: '', candidate: false };
      }

      if (now - runStartedAt < sustainMs) {
        return { capture: false, kind: '', candidate: true };
      }

      if (now - lastCaptureAt < cooldownMs) {
        return { capture: false, kind: '', candidate: true };
      }

      return { capture: true, kind: crosses ? 'crossing' : 'best', candidate: true };
    },
  };
}

/**
 * Creates a rotating buffer of full video frames.
 *
 * Snapshots are only taken while a spike candidate is live, so the buffer costs
 * nothing during ordinary tracking.
 *
 * @param {HTMLVideoElement} video Source video element.
 * @param {number} slots Number of frames retained.
 * @param {number} maxWidth Longest edge written to a snapshot.
 * @returns {object} Frame buffer.
 */
export function createFrameBuffer(video, slots, maxWidth) {
  const buffer = [];
  let cursor = 0;

  return {
    /**
     * Empties the buffer.
     *
     * @returns {void}
     */
    clear() {
      buffer.length = 0;
      cursor = 0;
    },

    /**
     * Records the current video frame with its measured sharpness.
     *
     * @param {number} sharpness Relative sharpness of this frame.
     * @param {number} distance Distance reading at this frame.
     * @returns {void}
     */
    push(sharpness, distance) {
      const videoW = video.videoWidth || 0;
      const videoH = video.videoHeight || 0;
      if (!videoW || !videoH) return;

      const scale = Math.min(1, maxWidth / videoW);
      const width = Math.round(videoW * scale);
      const height = Math.round(videoH * scale);

      let slot = buffer[cursor];
      if (!slot) {
        slot = { canvas: document.createElement('canvas'), sharpness: 0, distance: 0, t: 0 };
        buffer[cursor] = slot;
      }
      if (slot.canvas.width !== width || slot.canvas.height !== height) {
        slot.canvas.width = width;
        slot.canvas.height = height;
      }

      slot.canvas.getContext('2d').drawImage(video, 0, 0, width, height);
      slot.sharpness = sharpness;
      slot.distance = distance;
      slot.t = Date.now();
      cursor = (cursor + 1) % slots;
    },

    /**
     * Returns the sharpest retained frame.
     *
     * @returns {{canvas: HTMLCanvasElement, sharpness: number, distance: number, t: number}|null} Best frame.
     */
    best() {
      let winner = null;
      for (const slot of buffer) {
        if (slot && (!winner || slot.sharpness > winner.sharpness)) winner = slot;
      }
      return winner;
    },
  };
}
