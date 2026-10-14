/**
 * @module video-loader/controller
 * @description
 * Seekable local-video analysis controller. MediaPipe FaceLandmarker supplies
 * frequent presence and geometry, MediaPipe ImageEmbedder supplies an aligned
 * visual-change signal, and the heavier face-api recognition path runs only
 * for baseline capture, trigger verification, and a bounded heartbeat.
 */

import {
   MEDIAPIPE_FACE_LANDMARKER_URL,
   MEDIAPIPE_IMAGE_EMBEDDER_URL,
   MEDIAPIPE_TASKS_VISION_URL,
   MEDIAPIPE_WASM_URL,
   MODEL_URLS,
} from '../config.js';
import {
   DEFAULT_FACE_DISTANCE_THRESHOLD,
   buildAnchoredEmbeddingBaseline,
   buildAnchoredFaceBaseline,
   buildEmbeddingBaseline,
   buildFaceBaseline,
   createTriggerDetector,
   euclideanDistance,
   visualDrift,
} from './analysis.js';
import {
   appendJournal,
   appendSample,
   buildReport,
   createAnalysisSession,
   recordEvidenceObservation,
   recordManualFrameCheck,
   selectEventFrame,
   serializeTechnicalLog,
} from './session.js';

/**
 * @typedef {object} VideoLoaderConfig
 * @property {number} sampleIntervalSeconds Media-time interval between lightweight samples.
 * @property {number} baselineEmbeddingSamples Stable ImageEmbedder samples required.
 * @property {number} baselineFaceSamples Stable face-api descriptors required.
 * @property {number} anchoredBaselineEmbeddingSamples Comparable neighbours used around a selected frame.
 * @property {number} anchoredBaselineFaceSamples Face descriptors used around a selected frame.
 * @property {number} faceDistanceThreshold Face-api L2 distance threshold.
 * @property {number} heartbeatSeconds Maximum media-time gap between face-api checks.
 * @property {number} minimumFaceApiGapSeconds Minimum media-time gap between face-api checks.
 * @property {number} minimumVisualDelta Minimum ImageEmbedder drift above baseline noise.
 * @property {number} visualMadMultiplier Baseline MAD multiplier for adaptive visual drift.
 * @property {number} visualJumpDelta One-sample visual drift jump threshold.
 * @property {number} maximumBaselineAppearanceStep Largest accepted low-resolution crop change.
 * @property {number} maximumBaselineRollStep Largest accepted roll change in degrees.
 * @property {number} maximumBaselineYawStep Largest accepted approximate yaw change.
 * @property {number} maximumBaselineScaleStep Largest accepted face-width ratio change.
 * @property {number} maximumBaselineFaceSpread Largest accepted face-api baseline spread.
 * @property {number} maximumAnchoredBaselineFaceSpread Largest spread accepted around a human-selected frame.
 * @property {number} anchoredBaselineWindowSeconds Maximum local calibration span after a selected frame.
 * @property {number} alignedCropSize ImageEmbedder crop edge in pixels.
 * @property {number} evidenceRefinementRadiusSeconds Neighbourhood around a confirmed event.
 * @property {number} evidenceRefinementStepSeconds MediaPipe-only refinement cadence.
 * @property {number} evidenceRefinementFaceApiCandidates Maximum refined candidates verified by face-api.
 */

/** @type {VideoLoaderConfig} */
export const DEFAULT_VIDEO_LOADER_CONFIG = Object.freeze({
   sampleIntervalSeconds: 0.5,
   baselineEmbeddingSamples: 8,
   baselineFaceSamples: 3,
   anchoredBaselineEmbeddingSamples: 4,
   anchoredBaselineFaceSamples: 3,
   faceDistanceThreshold: DEFAULT_FACE_DISTANCE_THRESHOLD,
   heartbeatSeconds: 4,
   minimumFaceApiGapSeconds: 0.75,
   minimumVisualDelta: 0.025,
   visualMadMultiplier: 6,
   visualJumpDelta: 0.035,
   maximumBaselineAppearanceStep: 0.14,
   maximumBaselineRollStep: 10,
   maximumBaselineYawStep: 0.15,
   maximumBaselineScaleStep: 0.15,
   maximumBaselineFaceSpread: 0.3,
   maximumAnchoredBaselineFaceSpread: 0.5,
   anchoredBaselineWindowSeconds: 3,
   alignedCropSize: 224,
   evidenceRefinementRadiusSeconds: 1,
   evidenceRefinementStepSeconds: 0.2,
   evidenceRefinementFaceApiCandidates: 3,
});

/** MediaPipe landmark indices used only to normalise the face crop. */
const FACE_MESH = Object.freeze({
   rightEyeOuter: 33,
   leftEyeOuter: 263,
   noseTip: 1,
});

/**
 * Waits for a one-shot media event with a timeout that prevents a corrupt
 * source from hanging the analysis forever.
 *
 * @param {HTMLMediaElement} media Media element.
 * @param {string} eventName Event name.
 * @param {number} [timeoutMs=15000] Timeout in milliseconds.
 * @returns {Promise<void>} Resolves when the event fires.
 */
function waitForMediaEvent(media, eventName, timeoutMs = 15000) {
   return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
         cleanup();
         reject(new Error(`Timed out waiting for media event: ${eventName}`));
      }, timeoutMs);
      const onEvent = () => {
         cleanup();
         resolve();
      };
      const onError = () => {
         cleanup();
         reject(media.error || new Error(`Media error while waiting for ${eventName}.`));
      };
      const cleanup = () => {
         window.clearTimeout(timer);
         media.removeEventListener(eventName, onEvent);
         media.removeEventListener('error', onError);
      };
      media.addEventListener(eventName, onEvent, { once: true });
      media.addEventListener('error', onError, { once: true });
   });
}

/**
 * Seeks to a decoded video frame.
 *
 * @param {HTMLVideoElement} video Seekable video element.
 * @param {number} mediaTime Target media timestamp in seconds.
 * @returns {Promise<void>} Resolves after Chromium reports the seek complete.
 */
async function seekVideo(video, mediaTime) {
   const target = Math.max(0, Math.min(mediaTime, Number.isFinite(video.duration) ? video.duration : mediaTime));
   if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.001) return;
   const pending = waitForMediaEvent(video, 'seeked');
   video.currentTime = target;
   await pending;
}

/**
 * Extracts a numeric float embedding from a MediaPipe ImageEmbedder result.
 *
 * @param {object} result MediaPipe result.
 * @returns {number[]|null} Serializable embedding.
 */
function unpackEmbedding(result) {
   const vector = result?.embeddings?.[0]?.floatEmbedding;
   return vector ? Array.from(vector) : null;
}

/**
 * Draws an eye-levelled face crop using MediaPipe's normalised landmarks.
 * The crop removes most background and normalises roll and scale before the
 * generic ImageEmbedder sees any pixels.
 *
 * @param {HTMLVideoElement} video Source video.
 * @param {Array<{x: number, y: number}>} landmarks FaceLandmarker mesh.
 * @param {HTMLCanvasElement} canvas Reusable square crop surface.
 * @returns {{comparable: boolean, rollDegrees: number, yawOffset: number, faceWidthRatio: number}} Geometry metrics.
 */
function drawAlignedFaceCrop(video, landmarks, canvas) {
   const width = video.videoWidth || 1;
   const height = video.videoHeight || 1;
   const points = landmarks.map((point) => ({ x: point.x * width, y: point.y * height }));
   const xs = points.map((point) => point.x);
   const ys = points.map((point) => point.y);
   const minX = Math.min(...xs);
   const maxX = Math.max(...xs);
   const minY = Math.min(...ys);
   const maxY = Math.max(...ys);
   const faceWidth = Math.max(1, maxX - minX);
   const faceHeight = Math.max(1, maxY - minY);

   const eyeA = points[FACE_MESH.rightEyeOuter];
   const eyeB = points[FACE_MESH.leftEyeOuter];
   const nose = points[FACE_MESH.noseTip];
   if (!eyeA || !eyeB || !nose) {
      return { comparable: false, rollDegrees: 0, yawOffset: Infinity, faceWidthRatio: 0 };
   }
   const leftEye = eyeA.x <= eyeB.x ? eyeA : eyeB;
   const rightEye = eyeA.x <= eyeB.x ? eyeB : eyeA;
   const eyeMid = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2,
   };
   const interocular = Math.max(1, Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y));
   const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
   const rollDegrees = Math.abs((roll * 180) / Math.PI);
   const yawOffset = Math.abs(nose.x - eyeMid.x) / interocular;
   const faceWidthRatio = faceWidth / width;

   const centreX = (minX + maxX) / 2;
   const centreY = (minY + maxY) / 2;
   const sourceEdge = Math.max(faceWidth, faceHeight) * 1.35;
   const scale = canvas.width / sourceEdge;
   const context = canvas.getContext('2d', { willReadFrequently: true });
   context.save();
   context.setTransform(1, 0, 0, 1, 0, 0);
   context.fillStyle = '#000';
   context.fillRect(0, 0, canvas.width, canvas.height);
   context.translate(canvas.width / 2, canvas.height / 2);
   context.rotate(-roll);
   context.scale(scale, scale);
   context.translate(-centreX, -centreY);
   context.drawImage(video, 0, 0);
   context.restore();

   return {
      comparable: faceWidthRatio >= 0.12 && rollDegrees <= 25 && yawOffset <= 0.42,
      rollDegrees,
      yawOffset,
      faceWidthRatio,
   };
}

/**
 * Measures crop exposure and gradient energy. Sharpness is a ranking signal,
 * not a universal accept/reject threshold.
 *
 * @param {HTMLCanvasElement} canvas Aligned crop.
 * @returns {{sharpness: number, luma: number, clippedRatio: number, exposed: boolean, signature: number[]}} Quality metrics and a low-resolution RGB signature.
 */
function measureCropQuality(canvas) {
   const context = canvas.getContext('2d', { willReadFrequently: true });
   const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
   const gray = new Float32Array(width * height);
   let lumaTotal = 0;
   let clipped = 0;
   const signatureGrid = 8;
   const signatureChannels = new Float64Array(signatureGrid * signatureGrid * 3);
   const signatureCounts = new Uint16Array(signatureGrid * signatureGrid);
   for (let offset = 0, pixel = 0; offset < data.length; offset += 4, pixel += 1) {
      const value = (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) / 255;
      gray[pixel] = value;
      lumaTotal += value;
      if (value < 0.02 || value > 0.98) clipped += 1;
      const pixelX = pixel % width;
      const pixelY = Math.floor(pixel / width);
      const cellX = Math.min(signatureGrid - 1, Math.floor((pixelX / width) * signatureGrid));
      const cellY = Math.min(signatureGrid - 1, Math.floor((pixelY / height) * signatureGrid));
      const cell = cellY * signatureGrid + cellX;
      const channel = cell * 3;
      signatureChannels[channel] += data[offset] / 255;
      signatureChannels[channel + 1] += data[offset + 1] / 255;
      signatureChannels[channel + 2] += data[offset + 2] / 255;
      signatureCounts[cell] += 1;
   }
   let gradientEnergy = 0;
   for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
         const index = y * width + x;
         const horizontal = gray[index + 1] - gray[index - 1];
         const vertical = gray[index + width] - gray[index - width];
         gradientEnergy += horizontal * horizontal + vertical * vertical;
      }
   }
   const pixels = width * height;
   const luma = lumaTotal / pixels;
   const clippedRatio = clipped / pixels;
   const signature = Array.from(signatureChannels, (value, index) => {
      const count = signatureCounts[Math.floor(index / 3)] || 1;
      return value / count;
   });
   return {
      sharpness: gradientEnergy / pixels,
      luma,
      clippedRatio,
      exposed: luma >= 0.12 && luma <= 0.92 && clippedRatio <= 0.18,
      signature,
   };
}

/**
 * Computes mean absolute difference between equal-length appearance signatures.
 *
 * @param {number[]} left First RGB grid.
 * @param {number[]} right Second RGB grid.
 * @returns {number} Mean absolute channel difference in the range 0..1.
 */
function appearanceDistance(left, right) {
   if (!left || !right || left.length !== right.length) return Infinity;
   let total = 0;
   for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
   return total / left.length;
}

/**
 * Captures the decoded source frame at native video resolution.
 *
 * @param {HTMLVideoElement} video Source video.
 * @param {number} mediaTime Current video timestamp.
 * @param {number} sharpness Crop sharpness associated with the frame.
 * @param {string} reason Selection reason.
 * @returns {{mediaTime: number, dataUrl: string, width: number, height: number, sharpness: number, reason: string}} Frame artifact.
 */
function captureSourceFrame(video, mediaTime, sharpness, reason) {
   const canvas = document.createElement('canvas');
   canvas.width = video.videoWidth;
   canvas.height = video.videoHeight;
   canvas.getContext('2d').drawImage(video, 0, 0);
   return {
      mediaTime,
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      width: canvas.width,
      height: canvas.height,
      sharpness,
      reason,
   };
}

/**
 * Creates the seekable-video analysis controller.
 *
 * @param {HTMLVideoElement} video Local video element.
 * @param {Partial<VideoLoaderConfig>} [overrides] Configuration overrides.
 * @returns {object} Controller API.
 */
export function createVideoAnalysisController(video, overrides = {}) {
   /** @type {VideoLoaderConfig} */
   const config = { ...DEFAULT_VIDEO_LOADER_CONFIG, ...overrides };
   const cropCanvas = document.createElement('canvas');
   cropCanvas.width = config.alignedCropSize;
   cropCanvas.height = config.alignedCropSize;
   const triggerDetector = createTriggerDetector({
      heartbeatSeconds: config.heartbeatSeconds,
      minimumFaceApiGapSeconds: config.minimumFaceApiGapSeconds,
      jumpDelta: config.visualJumpDelta,
   });

   let faceLandmarker = null;
   let imageEmbedder = null;
   let modelsReady = false;
   let session = null;
   let sourceFile = null;
   let objectUrl = null;
   let cancelRequested = false;
   /** @type {Array<Function>} */
   const listeners = [];

   /**
    * Notifies the UI and Playwright bridge after state changes.
    *
    * @param {string} type Update type.
    * @param {object} [detail={}] Update detail.
    * @returns {void}
    */
   function notify(type, detail = {}) {
      const update = { type, session, ...detail };
      for (const listener of listeners) listener(update);
   }

   /**
    * Loads vendored face-api and MediaPipe models.
    *
    * @returns {Promise<void>} Resolves after every model is ready.
    */
   async function loadModels() {
      if (modelsReady) return;
      await Promise.all([
         faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
         faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
         faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.recognition),
      ]);
      const { FilesetResolver, FaceLandmarker, ImageEmbedder } = await import(MEDIAPIPE_TASKS_VISION_URL);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      [faceLandmarker, imageEmbedder] = await Promise.all([
         FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_URL, delegate: 'CPU' },
            runningMode: 'IMAGE',
            numFaces: 1,
            outputFaceBlendshapes: false,
         }),
         ImageEmbedder.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MEDIAPIPE_IMAGE_EMBEDDER_URL, delegate: 'CPU' },
            runningMode: 'IMAGE',
            l2Normalize: true,
         }),
      ]);
      modelsReady = true;
      notify('models-ready');
   }

   /**
    * Loads a local file into the video element and creates a fresh session.
    *
    * @param {File} file User-selected local video.
    * @param {object} [metadata] Optional Node-computed provenance.
    * @param {string|null} [metadata.fingerprint] Bounded source fingerprint.
    * @returns {Promise<object>} Fresh analysis session.
    */
   async function loadFile(file, metadata = {}) {
      cancelRequested = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      sourceFile = file;
      objectUrl = URL.createObjectURL(file);
      video.pause();
      video.srcObject = null;
      const metadataReady = waitForMediaEvent(video, 'loadedmetadata');
      video.src = objectUrl;
      video.load();
      await metadataReady;
      session = createAnalysisSession({
         name: file.name,
         size: file.size,
         type: file.type || 'application/octet-stream',
         lastModified: file.lastModified || null,
         duration: video.duration,
         width: video.videoWidth,
         height: video.videoHeight,
         fingerprint: metadata.fingerprint || null,
      }, config);
      session.models = {
         faceApi: '@vladmandic/face-api vendored bundle',
         faceMatcherDefaultThreshold: DEFAULT_FACE_DISTANCE_THRESHOLD,
         mediaPipeTasksVision: '0.10.35',
         mediaPipeDelegate: 'CPU',
         faceLandmarker: 'float16/1',
         imageEmbedder: 'mobilenet_v3_small float32/1',
      };
      appendJournal(session, 'source-loaded', { source: session.source });
      triggerDetector.reset();
      cancelRequested = false;
      notify('source-loaded');
      return session;
   }

   /**
    * Creates an empty analysis state for the already loaded source. This is
    * used when a failed or completed run is intentionally started again; a
    * resume operation keeps the existing session instead.
    *
    * @returns {object} Fresh session for the current source.
    */
   function resetLoadedSourceSession() {
      const source = structuredClone(session.source);
      const models = structuredClone(session.models);
      session = createAnalysisSession(source, config);
      session.models = models;
      appendJournal(session, 'source-reused', { source: session.source });
      triggerDetector.reset();
      return session;
   }

   /**
    * Runs face-api recognition against the current decoded frame.
    *
    * @returns {Promise<object|null>} Detection with landmarks and descriptor.
    */
   async function runFaceApi() {
      session.summary.faceApiRuns += 1;
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
      return faceapi.detectSingleFace(video, options).withFaceLandmarks().withFaceDescriptor();
   }

   /**
    * Compares one person-selected source timestamp with the established
    * baseline. The explicit request runs both detector families immediately,
    * stores one lightweight sample, captures the native frame, and creates a
    * manual story entry without pretending that it passed automatic voting.
    *
    * @param {number} mediaTime Source timestamp requested by the person.
    * @returns {Promise<object>} Created manual evidence event.
    */
   async function analyzeFrame(mediaTime) {
      if (!sourceFile || !session) throw new Error('Load a local video before analysing a frame.');
      if (!modelsReady) await loadModels();
      if (!session.baseline) throw new Error('Complete baseline acquisition before analysing an individual frame.');
      if (session.status === 'analysing') throw new Error('Pause the running analysis before inspecting an individual frame.');

      const target = Math.max(0, Math.min(video.duration, Number(mediaTime)));
      if (!Number.isFinite(target)) throw new Error('The requested frame timestamp is invalid.');
      await seekVideo(video, target);
      const mediaPipeResult = faceLandmarker.detect(video);
      const landmarks = mediaPipeResult?.faceLandmarks?.[0] || null;
      let geometry = null;
      let quality = null;
      let embedding = null;
      let comparable = false;
      if (landmarks) {
         geometry = drawAlignedFaceCrop(video, landmarks, cropCanvas);
         const measured = measureCropQuality(cropCanvas);
         quality = {
            sharpness: measured.sharpness,
            luma: measured.luma,
            clippedRatio: measured.clippedRatio,
            exposed: measured.exposed,
         };
         comparable = geometry.comparable && quality.exposed;
         if (comparable) embedding = unpackEmbedding(imageEmbedder.embed(cropCanvas));
      }
      const drift = comparable && embedding
         ? visualDrift(embedding, session.baseline.embedding)
         : null;
      const detection = await runFaceApi();
      const faceDistance = detection?.descriptor
         ? euclideanDistance(detection.descriptor, session.baseline.descriptor)
         : null;
      const interpretation = !comparable
         ? 'not-comparable'
         : !detection
            ? 'no-2d-face'
            : faceDistance >= config.faceDistanceThreshold
               ? 'above-threshold'
               : 'below-threshold';
      const sample = appendSample(session, {
         phase: 'manual',
         mediaTime: target,
         facePresent: !!landmarks,
         comparable,
         visualDrift: drift,
         visualThreshold: session.baseline.visualTriggerThreshold,
         geometry,
         quality,
      });
      const observation = {
         mediaTime: target,
         outcome: interpretation === 'above-threshold' || interpretation === 'no-2d-face'
            ? 'divergent'
            : interpretation === 'below-threshold' ? 'matched' : 'not-comparable',
         mediaPipeComparable: comparable,
         faceApiDetected: !!detection,
         faceDistance,
         faceThreshold: config.faceDistanceThreshold,
         visualDrift: drift,
         reasons: ['manual-frame-check'],
         quality,
      };
      appendJournal(session, 'face-api-result', { ...observation, origin: 'manual' });
      const frame = captureSourceFrame(
         video,
         target,
         quality?.sharpness || 0,
         'manual-frame-check',
      );
      const event = recordManualFrameCheck(session, {
         mediaTime: target,
         interpretation,
         observation,
         frame,
      });
      notify('manual-frame-checked', { event, sample });
      return event;
   }

   /**
    * Finds a clear frame near a confirmed event without retaining a frame
    * queue. MediaPipe ranks timestamps first; face-api then verifies only the
    * sharpest bounded subset before the native source frame is captured.
    *
    * @param {object} event Confirmed evidence event.
    * @param {number} analysisStart First allowed media timestamp.
    * @param {number} analysisEnd Last allowed media timestamp.
    * @returns {Promise<object>} Selected frame payload.
    */
   async function refineEvidenceFrame(event, analysisStart, analysisEnd) {
      const radius = config.evidenceRefinementRadiusSeconds;
      const rangeStart = Math.max(analysisStart, event.startMediaTime - radius);
      const rangeEnd = Math.min(analysisEnd, event.endMediaTime + radius);
      const candidates = [];

      for (let candidateTime = rangeStart; candidateTime <= rangeEnd + 0.0001; candidateTime += config.evidenceRefinementStepSeconds) {
         const mediaTime = Math.min(candidateTime, rangeEnd);
         await seekVideo(video, mediaTime);
         const result = faceLandmarker.detect(video);
         const landmarks = result?.faceLandmarks?.[0];
         if (!landmarks) continue;
         const geometry = drawAlignedFaceCrop(video, landmarks, cropCanvas);
         const measured = measureCropQuality(cropCanvas);
         const quality = {
            sharpness: measured.sharpness,
            luma: measured.luma,
            clippedRatio: measured.clippedRatio,
            exposed: measured.exposed,
         };
         if (!geometry.comparable || !quality.exposed) continue;
         candidates.push({ mediaTime, quality, geometry });
      }

      const ranked = candidates
         .sort((left, right) => right.quality.sharpness - left.quality.sharpness)
         .slice(0, config.evidenceRefinementFaceApiCandidates);
      let selected = null;
      let selectionSource = 'refined';
      for (const candidate of ranked) {
         await seekVideo(video, candidate.mediaTime);
         const detection = await runFaceApi();
         const faceDistance = detection?.descriptor
            ? euclideanDistance(detection.descriptor, session.baseline.descriptor)
            : null;
         const detectorMissing = !detection;
         const identityDistance = Number.isFinite(faceDistance)
            && faceDistance >= config.faceDistanceThreshold;
         const retainsEvidence = event.classification === 'identity-distance'
            ? identityDistance
            : event.classification === 'detector-divergence'
               ? detectorMissing
               : detectorMissing || identityDistance;
         appendJournal(session, 'evidence-refinement-check', {
            eventId: event.id,
            mediaTime: candidate.mediaTime,
            sharpness: candidate.quality.sharpness,
            faceApiDetected: !!detection,
            faceDistance,
            retainsEvidence,
         });
         if (retainsEvidence) {
            selected = {
               ...candidate,
               faceApiDetected: !!detection,
               faceDistance,
            };
            break;
         }
      }

      if (!selected) {
         const fallback = event.observations.reduce((best, item) => (
            (item.quality?.sharpness || 0) > (best.quality?.sharpness || 0) ? item : best
         ));
         selected = {
            mediaTime: fallback.mediaTime,
            quality: fallback.quality || { sharpness: 0 },
            faceApiDetected: fallback.faceApiDetected,
            faceDistance: fallback.faceDistance,
         };
         selectionSource = 'original-observation';
      }

      await seekVideo(video, selected.mediaTime);
      const reason = selected.faceApiDetected
         ? `${selectionSource}-face-distance-above-threshold`
         : `${selectionSource}-mediapipe-present-face-api-missing`;
      const frame = captureSourceFrame(
         video,
         selected.mediaTime,
         selected.quality?.sharpness || 0,
         reason,
      );
      selectEventFrame(event, frame);
      appendJournal(session, 'evidence-frame-selected', {
         eventId: event.id,
         mediaTime: frame.mediaTime,
         sharpness: frame.sharpness,
         reason,
         refinementCandidates: candidates.length,
         faceApiCandidates: ranked.length,
      });
      return frame;
   }

   /**
    * Finalises the baseline after enough stable samples have been accepted.
    *
    * @param {Array<object>} embeddingSamples Accepted embedding samples.
    * @param {Array<object>} faceSamples Accepted face-api samples.
    * @param {object} representativeFrame Visible baseline frame.
    * @param {number|null} anchoredMediaTime Human-selected timestamp, or null for automatic search.
    * @returns {object} Stored session baseline.
    */
   function finaliseBaseline(embeddingSamples, faceSamples, representativeFrame, anchoredMediaTime = null) {
      const embeddingVectors = embeddingSamples.map((sample) => sample.embedding);
      const faceDescriptors = faceSamples.map((sample) => sample.descriptor);
      const embeddingReferenceIndex = anchoredMediaTime === null
         ? null
         : embeddingSamples.findIndex((sample) => Math.abs(sample.mediaTime - anchoredMediaTime) < 0.001);
      const faceReferenceIndex = anchoredMediaTime === null
         ? null
         : faceSamples.findIndex((sample) => Math.abs(sample.mediaTime - anchoredMediaTime) < 0.001);
      const embeddingBaseline = anchoredMediaTime === null
         ? buildEmbeddingBaseline(embeddingVectors, {
            minimumDelta: config.minimumVisualDelta,
            madMultiplier: config.visualMadMultiplier,
         })
         : buildAnchoredEmbeddingBaseline(embeddingVectors, embeddingReferenceIndex, {
            minimumDelta: config.minimumVisualDelta,
            madMultiplier: config.visualMadMultiplier,
         });
      const faceBaseline = anchoredMediaTime === null
         ? buildFaceBaseline(faceDescriptors)
         : buildAnchoredFaceBaseline(faceDescriptors, faceReferenceIndex);
      session.baseline = {
         mediaTime: representativeFrame.mediaTime,
         selectionMode: anchoredMediaTime === null ? 'automatic-search' : 'selected-frame',
         selectedMediaTime: anchoredMediaTime,
         embedding: embeddingBaseline.embedding,
         descriptor: faceBaseline.descriptor,
         faceSpread: faceBaseline.spread,
         embeddingMedianDrift: embeddingBaseline.medianDrift,
         embeddingMad: embeddingBaseline.mad,
         visualTriggerThreshold: embeddingBaseline.triggerThreshold,
         frame: representativeFrame,
      };
      appendJournal(session, 'baseline-ready', {
         mediaTime: session.baseline.mediaTime,
         selectionMode: session.baseline.selectionMode,
         selectedMediaTime: session.baseline.selectedMediaTime,
         faceSpread: session.baseline.faceSpread,
         embeddingMedianDrift: session.baseline.embeddingMedianDrift,
         embeddingMad: session.baseline.embeddingMad,
         visualTriggerThreshold: session.baseline.visualTriggerThreshold,
      });
      return session.baseline;
   }

   /**
    * Runs the complete coarse scan over a selected media-time interval.
    *
    * @param {object} [options] Scan range and baseline search start.
    * @param {number} [options.start] First source timestamp.
    * @param {number} [options.end] Last source timestamp.
    * @param {number} [options.baselineTime] Baseline timestamp or automatic-search start.
    * @param {'anchored'|'search'} [options.baselineSelectionMode] Whether baselineTime is exact or a search start.
    * @param {number} [options.sampleIntervalSeconds] Coarse scan cadence.
    * @param {boolean} [options.resume] Continue a previously cancelled scan.
    * @returns {Promise<object>} Completed or cancelled session.
    */
   async function analyze(options = {}) {
      if (!sourceFile || !session) throw new Error('Load a local video before starting analysis.');
      if (!modelsReady) await loadModels();
      const resumeRequested = options.resume === true;
      if (resumeRequested && session.status !== 'cancelled') {
         throw new Error('Only a cancelled analysis can be resumed.');
      }
      if (!resumeRequested && session.status !== 'idle') resetLoadedSourceSession();
      const previousRange = session.config.analysisRange;
      const start = Math.max(0, Number(resumeRequested ? previousRange?.start ?? 0 : options.start ?? 0));
      const end = Math.min(
         video.duration,
         Number(resumeRequested ? previousRange?.end ?? video.duration : options.end ?? video.duration),
      );
      const baselineTime = Math.max(start, Math.min(
         end,
         Number(resumeRequested ? session.config.baselineSearchStart ?? start : options.baselineTime ?? start),
      ));
      const baselineSelectionMode = resumeRequested
         ? session.config.baselineSelectionMode ?? 'search'
         : options.baselineSelectionMode === 'anchored' ? 'anchored' : 'search';
      const anchoredBaseline = baselineSelectionMode === 'anchored';
      const baselineSearchEnd = anchoredBaseline
         ? Math.min(end, baselineTime + config.anchoredBaselineWindowSeconds)
         : end;
      const step = Math.max(0.1, Number(
         resumeRequested ? session.config.sampleIntervalSeconds : options.sampleIntervalSeconds ?? config.sampleIntervalSeconds,
      ));
      if (!(end > start)) throw new Error('Analysis end time must be greater than start time.');

      const previousScanSamples = session.samples.filter((sample) => sample.phase === 'scan');
      const lastScanSample = previousScanSamples.at(-1) || null;
      const resumeWithBaseline = resumeRequested && !!session.baseline;
      const resumeMediaTime = resumeWithBaseline && lastScanSample
         ? Math.min(end, lastScanSample.mediaTime + step)
         : start;
      const scanSampleTotal = Math.ceil((end - start) / step) + 1;
      let scanSampleIndex = previousScanSamples.length;
      const baselineEmbeddingSamplesRequired = anchoredBaseline
         ? config.anchoredBaselineEmbeddingSamples
         : config.baselineEmbeddingSamples;
      const baselineFaceSamplesRequired = anchoredBaseline
         ? config.anchoredBaselineFaceSamples
         : config.baselineFaceSamples;

      cancelRequested = false;
      video.pause();
      session.status = 'analysing';
      session.config.sampleIntervalSeconds = step;
      session.config.analysisRange = { start, end };
      session.config.baselineSearchStart = baselineTime;
      session.config.baselineSelectionMode = baselineSelectionMode;
      session.config.baselineSearchEnd = baselineSearchEnd;
      session.config.baselineSampleIntervalSeconds = Math.min(step, 0.25);
      appendJournal(session, resumeRequested ? 'analysis-resumed' : 'analysis-started', {
         start,
         end,
         baselineTime,
         baselineSelectionMode,
         baselineSearchEnd,
         sampleIntervalSeconds: step,
         resumeMediaTime: resumeRequested ? resumeMediaTime : null,
      });
      notify(resumeRequested ? 'analysis-resumed' : 'analysis-started', {
         start,
         end,
         resumeMediaTime: resumeRequested ? resumeMediaTime : null,
         scanSampleIndex,
         scanSampleTotal,
      });

      /** @type {Array<{mediaTime: number, embedding: number[], quality: object, signature: number[], geometry: object}>} */
      const embeddingSamples = [];
      /** @type {Array<{mediaTime: number, descriptor: number[]}>} */
      const faceSamples = [];
      let anchoredBaselineFailure = null;

      /**
       * Drops an unstable baseline run while retaining the reason in the
       * technical journal. No frame pixels are retained by the candidate.
       *
       * @param {string} reason Stable reset reason.
       * @param {number} atMediaTime Timestamp that broke continuity.
       * @param {object} [detail={}] Numeric diagnostics.
       * @returns {void}
       */
      function resetBaselineCandidate(reason, atMediaTime, detail = {}) {
         if (embeddingSamples.length || faceSamples.length) {
            appendJournal(session, 'baseline-candidate-reset', {
               reason,
               mediaTime: atMediaTime,
               acceptedEmbeddings: embeddingSamples.length,
               acceptedDescriptors: faceSamples.length,
               ...detail,
            });
         }
         embeddingSamples.length = 0;
         faceSamples.length = 0;
      }

      let phase = resumeWithBaseline ? 'scan' : 'baseline';
      let mediaTime = resumeWithBaseline ? resumeMediaTime : baselineTime;
      while (mediaTime <= end + 0.0001) {
         if (cancelRequested) break;
         if (phase === 'baseline' && mediaTime > baselineSearchEnd + 0.0001) break;
         const currentTime = Math.min(mediaTime, end);
         await seekVideo(video, currentTime);
         const mediaPipeResult = faceLandmarker.detect(video);
         const landmarks = mediaPipeResult?.faceLandmarks?.[0] || null;
         let geometry = null;
         let quality = null;
         let appearanceSignature = null;
         let embedding = null;
         let comparable = false;

         if (landmarks) {
            geometry = drawAlignedFaceCrop(video, landmarks, cropCanvas);
            const measuredQuality = measureCropQuality(cropCanvas);
            const { signature, ...serialisableQuality } = measuredQuality;
            quality = serialisableQuality;
            appearanceSignature = signature;
            comparable = geometry.comparable && quality.exposed;
            if (comparable) embedding = unpackEmbedding(imageEmbedder.embed(cropCanvas));
         }

         if (!session.baseline && comparable && embedding) {
            const previous = embeddingSamples.at(-1);
            const continuityDrift = previous ? visualDrift(embedding, previous.embedding) : 0;
            const appearanceStep = previous ? appearanceDistance(appearanceSignature, previous.signature) : 0;
            const rollStep = previous ? Math.abs(geometry.rollDegrees - previous.geometry.rollDegrees) : 0;
            const yawStep = previous ? Math.abs(geometry.yawOffset - previous.geometry.yawOffset) : 0;
            const scaleStep = previous ? Math.abs(geometry.faceWidthRatio - previous.geometry.faceWidthRatio) : 0;
            const unstable = appearanceStep > config.maximumBaselineAppearanceStep
               || rollStep > config.maximumBaselineRollStep
               || yawStep > config.maximumBaselineYawStep
               || scaleStep > config.maximumBaselineScaleStep;
            if (unstable) {
               const detail = { appearanceStep, continuityDrift, rollStep, yawStep, scaleStep };
               if (anchoredBaseline) {
                  appendJournal(session, 'anchored-baseline-neighbour-skipped', {
                     reason: 'appearance-or-pose-discontinuity',
                     mediaTime: currentTime,
                     ...detail,
                  });
               } else {
                  resetBaselineCandidate('appearance-or-pose-discontinuity', currentTime, detail);
               }
            }
            if (!unstable || !anchoredBaseline) {
               embeddingSamples.push({
                  mediaTime: currentTime,
                  embedding,
                  quality,
                  signature: appearanceSignature,
                  geometry,
               });
            }
            if (embeddingSamples.length >= baselineEmbeddingSamplesRequired) {
               const rankedVerificationSamples = [...embeddingSamples]
                  .sort((left, right) => right.quality.sharpness - left.quality.sharpness)
                  .filter((sample) => !anchoredBaseline
                     || Math.abs(sample.mediaTime - baselineTime) >= 0.001);
               const selectedSample = anchoredBaseline
                  ? embeddingSamples.find((sample) => Math.abs(sample.mediaTime - baselineTime) < 0.001)
                  : null;
               const verificationSamples = [
                  ...(selectedSample ? [selectedSample] : []),
                  ...rankedVerificationSamples,
               ]
                  .slice(0, baselineFaceSamplesRequired)
                  .sort((left, right) => left.mediaTime - right.mediaTime);
               faceSamples.length = 0;
               for (const candidate of verificationSamples) {
                  await seekVideo(video, candidate.mediaTime);
                  const detection = await runFaceApi();
                  if (detection?.descriptor) {
                     faceSamples.push({
                        mediaTime: candidate.mediaTime,
                        descriptor: Array.from(detection.descriptor),
                     });
                  }
               }

               if (faceSamples.length >= baselineFaceSamplesRequired) {
                  const selectedFaceIndex = anchoredBaseline
                     ? faceSamples.findIndex((sample) => Math.abs(sample.mediaTime - baselineTime) < 0.001)
                     : -1;
                  if (anchoredBaseline && selectedFaceIndex < 0) {
                     resetBaselineCandidate('selected-frame-face-api-missing', currentTime);
                     anchoredBaselineFailure = 'face-api-could-not-describe-the-selected-frame';
                  } else {
                     const provisionalFaceBaseline = anchoredBaseline
                        ? buildAnchoredFaceBaseline(
                           faceSamples.map((sample) => sample.descriptor),
                           selectedFaceIndex,
                        )
                        : buildFaceBaseline(faceSamples.map((sample) => sample.descriptor));
                     const maximumFaceSpread = anchoredBaseline
                        ? config.maximumAnchoredBaselineFaceSpread
                        : config.maximumBaselineFaceSpread;
                     if (provisionalFaceBaseline.spread <= maximumFaceSpread) {
                        const provisionalEmbeddingBaseline = buildEmbeddingBaseline(
                           embeddingSamples.map((sample) => sample.embedding),
                           {
                              minimumDelta: config.minimumVisualDelta,
                              madMultiplier: config.visualMadMultiplier,
                           },
                        );
                        const representative = anchoredBaseline
                           ? selectedSample
                           : embeddingSamples[provisionalEmbeddingBaseline.medoidIndex];
                        await seekVideo(video, representative.mediaTime);
                        const representativeFrame = captureSourceFrame(
                           video,
                           representative.mediaTime,
                           representative.quality.sharpness,
                           anchoredBaseline ? 'baseline-selected-frame' : 'baseline-embedding-medoid',
                        );
                        finaliseBaseline(
                           embeddingSamples,
                           faceSamples,
                           representativeFrame,
                           anchoredBaseline ? baselineTime : null,
                        );
                        triggerDetector.markFaceApi(currentTime);
                        notify('baseline-ready');
                     } else {
                        resetBaselineCandidate('face-descriptor-spread', currentTime, {
                           faceSpread: provisionalFaceBaseline.spread,
                        });
                        if (anchoredBaseline) anchoredBaselineFailure = 'selected-frame-descriptors-are-not-stable';
                     }
                  }
               } else {
                  const selectedFaceAvailable = faceSamples.some(
                     (sample) => Math.abs(sample.mediaTime - baselineTime) < 0.001,
                  );
                  if (anchoredBaseline && selectedFaceAvailable) {
                     appendJournal(session, 'anchored-baseline-face-sample-incomplete', {
                        mediaTime: currentTime,
                        acceptedDescriptors: faceSamples.length,
                        requiredDescriptors: baselineFaceSamplesRequired,
                     });
                  } else {
                     resetBaselineCandidate('face-api-baseline-incomplete', currentTime);
                     if (anchoredBaseline) {
                        anchoredBaselineFailure = 'face-api-could-not-describe-the-selected-frame';
                     }
                  }
               }
            }
         } else if (!session.baseline && embeddingSamples.length) {
            if (anchoredBaseline) {
               appendJournal(session, 'anchored-baseline-neighbour-skipped', {
                  reason: 'non-comparable-frame',
                  mediaTime: currentTime,
               });
            } else {
               resetBaselineCandidate('non-comparable-frame', currentTime);
            }
         } else if (!session.baseline && anchoredBaseline && currentTime === baselineTime) {
            anchoredBaselineFailure = 'selected-frame-is-not-comparable';
         }

         const drift = session.baseline && embedding
            ? visualDrift(embedding, session.baseline.embedding)
            : null;
         const sample = appendSample(session, {
            phase,
            mediaTime: currentTime,
            facePresent: !!landmarks,
            comparable,
            visualDrift: drift,
            visualThreshold: session.baseline?.visualTriggerThreshold ?? null,
            geometry,
            quality,
         });
         if (phase === 'scan') {
            scanSampleIndex += 1;
            session.config.lastScanMediaTime = currentTime;
         }

         if (session.baseline && phase === 'scan') {
            const decision = triggerDetector.evaluate(sample);
            for (const observation of decision.observations) {
               appendJournal(session, observation, { mediaTime: currentTime });
            }
            if (decision.shouldVerify) {
               const detection = await runFaceApi();
               triggerDetector.markFaceApi(currentTime);
               const faceDistance = detection?.descriptor
                  ? euclideanDistance(detection.descriptor, session.baseline.descriptor)
                  : null;
               const divergent = !detection || faceDistance >= config.faceDistanceThreshold;
               const observation = {
                  mediaTime: currentTime,
                  outcome: divergent ? 'divergent' : 'matched',
                  mediaPipeComparable: comparable,
                  faceApiDetected: !!detection,
                  faceDistance,
                  faceThreshold: config.faceDistanceThreshold,
                  visualDrift: drift,
                  reasons: decision.reasons,
                  quality,
               };
               appendJournal(session, 'face-api-result', observation);

               if (divergent) {
                  const confirmedBeforeObservation = session.summary.confirmedEvents;
                  const event = recordEvidenceObservation(session, observation);
                  const newlyConfirmed = session.summary.confirmedEvents > confirmedBeforeObservation;
                  if (newlyConfirmed) {
                     await refineEvidenceFrame(event, start, end);
                     notify('event-confirmed', { event });
                  }
               }
            }
         }

         notify('sample', {
            sample,
            phase,
            progress: phase === 'baseline' ? 0 : (currentTime - start) / (end - start),
            baselineAcceptedSamples: phase === 'baseline' ? embeddingSamples.length : null,
            baselineRequiredSamples: baselineEmbeddingSamplesRequired,
            baselineAcceptedDescriptors: phase === 'baseline' ? faceSamples.length : null,
            baselineRequiredDescriptors: baselineFaceSamplesRequired,
            scanSampleIndex,
            scanSampleTotal,
         });
         if (anchoredBaselineFailure && phase === 'baseline') break;
         if (session.baseline && phase === 'baseline') {
            phase = 'scan';
            mediaTime = start;
            triggerDetector.reset();
            appendJournal(session, 'analysis-scan-started', { start, end });
            notify('analysis-scan-started', { start, end });
            await new Promise((resolve) => window.setTimeout(resolve, 0));
            continue;
         }
         if (currentTime >= end) break;
         const nextTime = currentTime + (phase === 'scan' ? step : session.config.baselineSampleIntervalSeconds);
         mediaTime = nextTime > end ? end : nextTime;
         await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      if (!session.baseline && !cancelRequested) {
         session.status = 'failed';
         const selectedEmbeddingAvailable = embeddingSamples.some(
            (sample) => Math.abs(sample.mediaTime - baselineTime) < 0.001,
         );
         const selectedDescriptorAvailable = faceSamples.some(
            (sample) => Math.abs(sample.mediaTime - baselineTime) < 0.001,
         );
         const reason = anchoredBaselineFailure || (anchoredBaseline
            ? selectedEmbeddingAvailable && embeddingSamples.length < baselineEmbeddingSamplesRequired
               ? 'selected-frame-neighbours-insufficient'
               : selectedDescriptorAvailable && faceSamples.length < baselineFaceSamplesRequired
                  ? 'selected-frame-descriptors-insufficient'
               : 'selected-frame-window-incomplete'
            : 'baseline-not-found');
         const failureDetail = {
            reason,
            baselineTime,
            baselineSearchEnd,
            acceptedEmbeddings: embeddingSamples.length,
            requiredEmbeddings: baselineEmbeddingSamplesRequired,
            acceptedDescriptors: faceSamples.length,
            requiredDescriptors: baselineFaceSamplesRequired,
         };
         appendJournal(session, 'analysis-failed', failureDetail);
         notify('analysis-failed', failureDetail);
         if (anchoredBaseline) {
            if (reason === 'selected-frame-neighbours-insufficient') {
               throw new Error(`The selected baseline at ${baselineTime.toFixed(3)} s had only ${embeddingSamples.length} of ${baselineEmbeddingSamplesRequired} comparable nearby frames. Choose a steadier moment and try again.`);
            }
            if (reason === 'selected-frame-descriptors-insufficient') {
               throw new Error(`The selected baseline at ${baselineTime.toFixed(3)} s had only ${faceSamples.length} of ${baselineFaceSamplesRequired} nearby face-api descriptors. Choose a clearer interval and try again.`);
            }
            throw new Error(`The selected baseline at ${baselineTime.toFixed(3)} s could not produce a stable local reference (${reason}). Choose a clearer frame and try again.`);
         }
         throw new Error('No stable face baseline was found in the selected interval.');
      }

      session.status = cancelRequested ? 'cancelled' : 'complete';
      session.updatedAt = new Date().toISOString();
      if (cancelRequested && Number.isFinite(session.config.lastScanMediaTime)) {
         await seekVideo(video, session.config.lastScanMediaTime);
      }
      appendJournal(session, cancelRequested ? 'analysis-cancelled' : 'analysis-complete', {
         summary: session.summary,
         lastScanMediaTime: session.config.lastScanMediaTime ?? null,
         scanSampleIndex,
         scanSampleTotal,
      });
      const cancelledProgress = Number.isFinite(session.config.lastScanMediaTime)
         ? Math.max(0, Math.min(1, (session.config.lastScanMediaTime - start) / (end - start)))
         : 0;
      notify(session.status === 'complete' ? 'analysis-complete' : 'analysis-cancelled', {
         progress: session.status === 'complete' ? 1 : cancelledProgress,
         mediaTime: session.config.lastScanMediaTime ?? null,
         scanSampleIndex,
         scanSampleTotal,
      });
      return session;
   }

   /**
    * Requests cancellation at the next sample boundary.
    *
    * @returns {void}
    */
   function cancel() {
      cancelRequested = true;
   }

   /**
    * Returns report, technical log, and separately addressable image artifacts.
    *
    * @returns {{report: object, technicalLog: string, frames: Array<object>}} Export bundle.
    */
   function exportBundle() {
      if (!session) throw new Error('No analysis session is available.');
      const frames = [];
      if (session.baseline?.frame) frames.push({ id: 'baseline', ...session.baseline.frame });
      for (const event of session.events) {
         if (event.status === 'confirmed' && event.selectedFrame) {
            frames.push({ id: event.id, ...event.selectedFrame });
         }
      }
      return {
         report: buildReport(session),
         technicalLog: serializeTechnicalLog(session),
         frames,
      };
   }

   return {
      config,
      loadModels,
      loadFile,
      analyze,
      analyzeFrame,
      cancel,
      exportBundle,
      getSession: () => session,
      isModelsReady: () => modelsReady,
      subscribe(listener) {
         listeners.push(listener);
         return () => {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
         };
      },
   };
}
