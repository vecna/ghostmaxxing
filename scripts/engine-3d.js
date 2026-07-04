/**
 * @module engine-3d
 * @description
 * 3D biometric pipeline for Ghostati.
 *
 * Parallel to engine.js (face-api / 128-D / euclidean distance), this module
 * implements the ImageEmbedder path:
 *   - feature embedding extracted from a canvas or video element
 *   - Cosine similarity as the distance metric (higher = more similar)
 *   - Separate localStorage DB (state.db3d) sharing IDs with the 2D DB
 *   - MATCH_THRESHOLD_3D: similarity >= threshold counts as a match
 *
 * IMPORTANT — what this is NOT:
 *   The embedder was trained for generic image similarity, not face recognition.
 *   It responds strongly to global visual context (background, lighting,
 *   colour palette) as much as to facial geometry. False positives on
 *   similar backgrounds are expected and are part of the didactic point:
 *   this is a "feature-level" engine, not a biometric one.
 *
 * This module does NOT dispatch `matchStateChanged`. All events are
 * dispatched by the orchestrator in main.js / auto-find-loop.js after
 * composing the unified payload from both engines.
 *
 */

import { state } from './state.js';
import { els } from './dom.js';
import { setLog } from './utils.js';
import { persistDb3d } from './db.js';
import { MEDIAPIPE_IMAGE_EMBEDDER_URL, MEDIAPIPE_TASKS_VISION_URL, MEDIAPIPE_WASM_URL } from './config.js';

// ─────────────────────────────────────────────
// Model lifecycle
// ─────────────────────────────────────────────

/**
 * Load the 3D embedder and store it on state.
 * Safe to call multiple times — returns immediately if already loaded.
 *
 * Historical note: the exported name stays `loadMobileNet()` to preserve
 * the public API used by main.js, even though the implementation now loads
 * MediaPipe ImageEmbedder with MobileNetV3 Small.
 *
 * @param {object|null} embedderInstance Optional injected embedder for tests.
 * @returns {Promise<void>}
 * @see main.js – called during init after face-api models are loaded.
 */
export async function loadMobileNet(embedderInstance = null) {
   if (state.imageEmbedder) return;
   if (embedderInstance) {
      state.imageEmbedder = embedderInstance;
      return;
   }
   const { FilesetResolver, ImageEmbedder } = await import(MEDIAPIPE_TASKS_VISION_URL);
   const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
   state.imageEmbedder = await ImageEmbedder.createFromOptions(vision, {
      baseOptions: {
         modelAssetPath: MEDIAPIPE_IMAGE_EMBEDDER_URL,
         delegate: 'GPU'
      },
      runningMode: 'VIDEO'
   });
   setLog('[3D] ImageEmbedder pronto.', 'engine-3d');
}

// ─────────────────────────────────────────────
// Core math
// ─────────────────────────────────────────────

/**
 * Cosine similarity between two numeric vectors.
 * Returns a value in [-1, 1]; 1 = identical direction.
 * Higher values mean MORE similar (opposite sign convention from L2 distance).
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
export function cosineSimilarity(vecA, vecB) {
   let dot = 0, normA = 0, normB = 0;
   for (let i = 0; i < vecA.length; i++) {
      dot   += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
   }
   const denom = Math.sqrt(normA) * Math.sqrt(normB);
   return denom === 0 ? 0 : dot / denom;
}

// ─────────────────────────────────────────────
// Embedding extraction
// ─────────────────────────────────────────────

/**
 * Extract an ImageEmbedder embedding from a canvas or video element.
 *
 * NOTE: ImageEmbedder responds to global image content (background, colours,
 * texture) as much as to the face itself. This is a known characteristic
 * and is the didactic subject of the workshop.
 *
 * @param {HTMLCanvasElement|HTMLVideoElement} source
 * @returns {Promise<number[]>} Embedding vector serialisable to JSON.
 */
export async function getFaceEmbedding(source) {
   if (!state.imageEmbedder) throw new Error('[engine-3d] ImageEmbedder non caricato.');
   try {
      const result = state.imageEmbedder.embedForVideo(source, performance.now());
      const embedding = result?.embeddings?.[0]?.floatEmbedding;
      if (!embedding) {
         throw new Error('Nessun embedding restituito dal modello.');
      }
      return Array.from(embedding);
   } catch (err) {
      console.error('[getFaceEmbedding]', err);
      throw new Error(`Errore estrazione embedding: ${err.message}`);
   }
}

// ─────────────────────────────────────────────
// DB operations
// ─────────────────────────────────────────────

/**
 * Scan the 3D DB for the best cosine-similarity match against `embedding`.
 *
 * @param {number[]} embedding  Query vector.
 * @returns {{ liveMaxSim: number|null, liveMaxId: number|null }}
 */
export function seekFaceInDb3d(embedding) {
   if (!state.db3d || state.db3d.faces.length === 0) {
      return { liveMaxSim: null, liveMaxId: null };
   }
   let maxSim = -Infinity, maxId = null;
   for (const rec of state.db3d.faces) {
      const sim = cosineSimilarity(embedding, rec.descriptor3d);
      if (sim > maxSim) { maxSim = sim; maxId = rec.id; }
   }
   return { liveMaxSim: maxSim, liveMaxId: maxId };
}

/**
 * Save an ImageEmbedder embedding to state.db3d under the given `id`.
 * The `id` is assigned by engine.js (saveFace) and passed here so both
 * DBs stay in sync without a shared counter.
 *
 * @param {number} id  ID already assigned by the 2D engine's saveFace.
 * @returns {Promise<{ id: number, liveInfo3d: object }|null>}
 *   Returns null if model not ready or DB not initialised.
 */
export async function saveFace3d(id) {
   if (!state.imageEmbedder) {
      setLog('[3D] ImageEmbedder non pronto — embedding 3D non salvato.', 'engine-3d');
      return null;
   }
   if (!state.db3d) {
      setLog('[3D] DB 3D non inizializzato.', 'engine-3d');
      return null;
   }
   let embedding;
   try {
      embedding = await getFaceEmbedding(els.video);
   } catch (err) {
      setLog(`[3D] Errore estrazione embedding: ${err.message}`, 'engine-3d');
      return null;
   }
   state.db3d.faces.push({
      id,
      descriptor3d: embedding,
      savedAt: new Date().toISOString(),
   });
   persistDb3d();
   setLog(`[3D] Embedding ImageEmbedder salvato con ID ${id}.`, 'engine-3d');
   // After saving, seek to get liveInfo (best match is the record we just saved: sim ≈ 1)
   const liveInfo3d = seekFaceInDb3d(embedding);
   return { id, liveInfo3d };
}

// ─────────────────────────────────────────────
// Compositing (3D efficacy test)
// ─────────────────────────────────────────────

/**
 * Helper: is any 2D or 3D plugin currently active?
 * Mirrors hasActivePlugin() from engine.js without importing it.
 * @returns {boolean}
 */
function hasActivePlugin3d() {
   const G = window.gstmxx;
   const a2d = typeof G?.getActiveEffect  === 'function' && G.getActiveEffect();
   const a3d = typeof G?.getActiveEffect3d === 'function' && G.getActiveEffect3d();
   return !!(a2d || a3d);
}

/**
 * Build a composited canvas (video frame + active 3D ghostyle overlay) and
 * extract an ImageEmbedder embedding from it.
 *
 * Dispatches `beforeEfficacyComposite3d` on the event bus so 3D plugins can
 * draw onto the canvas before the embedding is extracted. Plugins receive:
 *   `{ canvas, ctx, landmarks3d: state.lastLandmarks3d }`
 *
 * @returns {Promise<{ canvas: HTMLCanvasElement, embedding: number[] }|null>}
 *   Returns null if model not ready.
 */
export async function compositeAndDetect3d() {
   if (!state.imageEmbedder) return null;

   const canvas = document.createElement('canvas');
   canvas.width  = els.overlay.width;
   canvas.height = els.overlay.height;
   const ctx = canvas.getContext('2d');
   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);

   // Allow 3D ghostyle plugins to draw onto this canvas before embedding.
   state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite3d', {
      detail: { canvas, ctx, landmarks3d: state.lastLandmarks3d }
   }));

   const embedding = await getFaceEmbedding(canvas);
   return { canvas, embedding };
}

// ─────────────────────────────────────────────
// Find pipeline
// ─────────────────────────────────────────────

/**
 * Run the full 3D find pipeline:
 *   1. Extract embedding from the current video frame.
 *   2. Find best cosine-similarity match in state.db3d.
 *   3. If a plugin is active, also extract composite embedding.
 *   4. Return raw metrics for the orchestrator to compose into the
 *      unified `matchStateChanged` payload — does NOT dispatch any event.
 *
 * Returns null if:
 *   - ImageEmbedder not loaded yet
 *   - state.db3d is empty (3D DB has no entries)
 *
 * Returns `{ liveInfo3d, composite3d }` otherwise, where composite3d is
 * null when no plugin is active.
 *
 * @returns {Promise<{ liveInfo3d: object, composite3d: object|null }|null>}
 */
export async function findFace3d() {
   if (!state.imageEmbedder) {
      setLog('[3D] ImageEmbedder non pronto — confronto 3D saltato.', 'engine-3d');
      return null;
   }
   if (!state.db3d || state.db3d.faces.length === 0) {
      return { liveInfo3d: { liveMaxSim: null, liveMaxId: null }, composite3d: null };
   }

   let liveEmbedding;
   try {
      liveEmbedding = await getFaceEmbedding(els.video);
   } catch (err) {
      setLog(`[3D] Errore estrazione embedding live: ${err.message}`, 'engine-3d');
      return null;
   }

   const liveInfo3d = seekFaceInDb3d(liveEmbedding);
   const composite3d = hasActivePlugin3d() ? await compositeAndDetect3d() : null;

   return { liveInfo3d, composite3d };
}

// ─────────────────────────────────────────────
// Match decision
// ─────────────────────────────────────────────

/**
 * Decide match state for the 3D (cosine-similarity) engine.
 *
 * Cosine similarity convention: HIGHER = MORE SIMILAR.
 * threshold: similarity >= MATCH_THRESHOLD_3D → matched.
 *
 * When a ghostyle is present, the obfuscated embedding is the primary signal
 * (same rationale as engine.js's decideMatchState for the 2D case).
 *
 * @param {object} params
 * @param {number|null} params.liveMaxSim   Best live similarity (highest in DB).
 * @param {number|null} params.liveMaxId    ID of best live match.
 * @param {number|null} params.obfMaxSim    Best composite similarity (null if no plugin).
 * @param {number|null} params.obfMaxId     ID of best composite match.
 * @returns {{ detectionState: string, headline: string }}
 */
export function decideMatchState3d({ liveMaxSim, liveMaxId, obfMaxSim, obfMaxId }) {
   const thr = state.MATCH_THRESHOLD_3D;

   if (obfMaxSim != null) {
      // Ghostyle active: judge on composite embedding
      if (typeof obfMaxId === 'number' && obfMaxSim >= thr) {
         return {
            detectionState: 'matched',
            headline: `[3D] Ghostyle presente: ImageEmbedder abbina ID ${obfMaxId} (similarità ${obfMaxSim.toFixed(3)} ≥ ${thr.toFixed(2)}).`,
         };
      }
      return {
         detectionState: 'eluded',
         headline: `[3D] Ghostyle presente: ImageEmbedder non abbina (similarità ${(obfMaxSim ?? 0).toFixed(3)} < ${thr.toFixed(2)}). Embedding visivo spostato.`,
      };
   }

   // No ghostyle: judge on live embedding
   if (liveMaxSim == null) {
      return { detectionState: 'unknown', headline: '[3D] DB 3D vuoto, nessun confronto ImageEmbedder.' };
   }
   if (liveMaxSim >= thr) {
      return {
         detectionState: 'matched',
         headline: `[3D] Corrispondenza ImageEmbedder: ID ${liveMaxId} (similarità ${liveMaxSim.toFixed(3)} ≥ ${thr.toFixed(2)}).`,
      };
   }
   return {
      detectionState: 'eluded',
      headline: `[3D] Nessuna corrispondenza ImageEmbedder (max similarità ${liveMaxSim.toFixed(3)} < ${thr.toFixed(2)}).`,
   };
}

/**
 * Build the `mediapipe` section of the unified `matchStateChanged` payload.
 *
 * NOTE: the field is named `mediapipe` in the payload (matching the landmark
 * source) because both tasks are powered by MediaPipe. The two models run in the
 * same MediaPipe-initiated pipeline.
 *
 * @param {{ liveInfo3d: object, composite3d: object|null }} result3d
 *   As returned by findFace3d().
 * @returns {{ detectionState, headline, liveMaxSim, liveMaxId, obfMaxSim, obfMaxId }|null}
 *   Returns null if liveInfo3d is fully empty (model not ready / no records).
 */
export function evaluateMatch3d(result3d) {
   if (!result3d) return null;
   const { liveInfo3d, composite3d } = result3d;
   if (!liveInfo3d) return null;

   const { liveMaxSim, liveMaxId } = liveInfo3d;

   let obfMaxSim = null, obfMaxId = null;
   if (composite3d?.embedding) {
      const obfInfo = seekFaceInDb3d(composite3d.embedding);
      obfMaxSim = obfInfo.liveMaxSim;
      obfMaxId  = obfInfo.liveMaxId;
   }

   const { detectionState, headline } = decideMatchState3d({ liveMaxSim, liveMaxId, obfMaxSim, obfMaxId });

   // The similarity that drove the decision (composite if present, live otherwise)
   const similarity = obfMaxSim ?? liveMaxSim;
   const matchedId  = obfMaxSim != null
      ? (obfMaxSim >= state.MATCH_THRESHOLD_3D ? obfMaxId : null)
      : (liveMaxSim != null && liveMaxSim >= state.MATCH_THRESHOLD_3D ? liveMaxId : null);

   return {
      detectionState,
      headline,
      similarity,
      matchedId,
      liveMaxSim,
      liveMaxId,
      obfMaxSim,
      obfMaxId,
   };
}
