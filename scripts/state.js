/**
 * @module state
 * @description
 * Single source of mutable runtime state for the Ghostmaxxing web app. A plain
 * object shared (by reference) across all ES modules via `import { state }`.
 * There is exactly one instance; mutating a field here is observed everywhere.
 *
 * The full shape — including the type, allowed range, and consuming modules of
 * every field — is documented on the {@link GhostmaxxingState} typedef below, which
 * renders as a properties table.
 *
 * Note on events: the in-app event bus is `state.gstmxxEvents`. The
 * `ghostatiReady` lifecycle event is the one exception — it is dispatched on
 * `window`, NOT on this bus.
 */

/**
 * A single enrolled face record persisted in the local DB.
 * @typedef {Object} FaceRecord
 * @property {number} id            Stable identifier assigned at enrollment.
 * @property {Float32Array|number[]} descriptor  128-D face-api recognition descriptor.
 */

/**
 * A single enrolled face record persisted in the 3D DB.
 * @typedef {Object} FaceRecord3d
 * @property {number} id            Same ID as the corresponding FaceRecord (assigned by engine.js).
 * @property {number[]} descriptor3d  Image embedding produced by MediaPipe ImageEmbedder.
 * @property {string} savedAt       ISO timestamp.
 */

/**
 * A loaded 2D ghostyle plugin entry.
 * @typedef {Object} GhostyleEntry
 * @property {string} id        Identifier derived from the script filename (key in loadedGhostyles).
 * @property {string} name      Human-readable name parsed from the `@name` header.
 * @property {object} module    The imported ES module (may export onInit/onClear/draw hooks).
 * @property {string} url       URL the module was loaded from.
 */

/**
 * Shape of the shared runtime state object. Each property documents its type,
 * its allowed/observed range, and the modules that read or write it.
 *
 * @typedef {Object} GhostmaxxingState
 *
 * @property {{ nextId: number, faces: FaceRecord[] } | null} db
 *   Local face database (recognition descriptors + id counter).
 *   **Range:** `null` until `db.loadDb()` runs at startup; afterwards an object
 *   where `nextId >= 0` and `faces` is a (possibly empty) array.
 *   **Used in:** db.js (load/save/clear/renderDbStats), engine.js (descriptor
 *   matching), utils.js (computeMatchState), main.js (init, `Ghostati.getDb`).
 *
 * @property {{ faces: FaceRecord3d[], modelVersion: string } | null} db3d
 *   Local 3D face database (ImageEmbedder embeddings, keyed by same IDs as db).
 *   **Range:** `null` until `db.loadDb3d()` runs at startup.
 *   **Used in:** db.js (load/save/clear), engine-3d.js (embedding matching), main.js.
 *
 * @property {undefined} [thumbnailsStore]
 *   Documentation-only reference to the dedicated thumbnail persistence store
 *   in `localStorage` (`local-face-lab-thumbnails-v1`). Managed exclusively by
 *   `face-thumbnails.js` and intentionally not mirrored onto `state`.
 *
 * @property {string|null} activeEffect
 *   Identifier of the currently active 2D ghostyle effect.
 *   **Range:** `null` when no effect is active, otherwise a key present in
 *   `loadedGhostyles`.
 *   **Used in:** ghostyles-manager.js (toggleEffect/deactivateEffect), dom.js
 *   (clearActiveEffect/effectSelected), engine.js (runEffectPass,
 *   hasActivePlugin), main.js (scan branch, `Ghostati.getActiveEffect`).
 *
 * @property {boolean} effectInferenceInFlight
 *   Re-entrancy guard: `true` while an async face-api inference for the effect
 *   pass is in flight, to prevent overlapping detections.
 *   **Range:** `true` | `false`.
 *   **Used in:** camera.js (effect loop), engine.js (runEffectPass guard, reset in finally).
 *
 * @property {number} lastEffectRun
 *   Timestamp of the last effect-loop iteration, used to throttle inference to
 *   the selected frame rate.
 *   **Range:** milliseconds (`performance.now()` domain), `>= 0`; starts at `0`.
 *   **Used in:** camera.js only (effect loop throttling).
 *
 * @property {boolean} isSystemBusy
 *   Global "system busy" flag. While `true`, interactive controls are disabled
 *   to prevent concurrent operations (model load, scan, save, find).
 *   **Range:** `true` | `false`.
 *   **Used in:** main.js (setBusy toggles it and the control disabled states),
 *   engine.js (guards in detection passes).
 *
 * @property {object|null} lastKnownEffectResult
 *   Most recent face-api detection result from the effect loop, cached so other
 *   code (e.g. plugins) can read the current landmarks without re-detecting.
 *   **Range:** `null` when no face is detected or the effect is cleared; otherwise
 *   a face-api detection result, optionally carrying 68-point landmarks (shape
 *   depends on whether an effect requiring landmarks is active).
 *   **Used in:** engine.js (set in runEffectPass / scan / efficacy paths), dom.js
 *   (reset to `null` in clearActiveEffect), main.js (`Ghostati.getLastResult`).
 *
 * @property {HTMLCanvasElement|null} lastCompositedCanvas
 *   The last composited canvas (live frame + applied makeup overlay) produced by
 *   the efficacy test; reused by the "copy makeup" export.
 *   **Range:** `null` until an efficacy composite is produced; then a canvas sized
 *   to the video's native resolution.
 *   **Used in:** engine.js (set after compositing), dom.js (reset to `null`),
 *   main.js (copyMakeup export source; gates copyMakeupBtn enabled state in setBusy).
 *
 * @property {boolean} isMirrored
 *   Whether the webcam preview (and overlays) are horizontally mirrored.
 *   **Range:** `true` | `false`. Set to `true` automatically for the front camera
 *   (`currentFacingMode === 'user'`).
 *   **Used in:** camera.js (set on camera start), engine.js (compositing transform),
 *   utils.js (drawing), main.js (mirror toggle, export flip).
 *
 * @property {'user'|'environment'} currentFacingMode
 *   Active camera facing mode passed to `getUserMedia`.
 *   **Range:** exactly `'user'` (front) or `'environment'` (rear); defaults to `'user'`.
 *   **Used in:** camera.js (getUserMedia constraint, drives isMirrored),
 *   main.js (switchCamera button toggles it).
 *
 * @property {HTMLElement[]} logsArchive
 *   Rolling archive of rendered log line DOM nodes.
 *   **Range:** 0–100 elements; capped at 100, oldest entries shifted out (FIFO).
 *   **Used in:** utils.js (setLog pushes, updateLogDisplay renders),
 *   main.js (`Ghostati.clearVisibleLogs`).
 *
 * @property {number} visibleLogStartIndex
 *   Index into `logsArchive` marking where currently-visible logs begin, so the
 *   user can clear the visible view without dropping the archive.
 *   **Range:** `0 .. logsArchive.length`; decremented when the archive shifts.
 *   **Used in:** utils.js (updateLogDisplay), main.js (clearVisibleLogs).
 *
 * @property {number|null} overlayFadeTimeout
 *   Handle for the pending overlay fade-out `setTimeout`.
 *   **Range:** `null` when no fade is scheduled; otherwise a positive timeout id.
 *   **Used in:** engine.js (schedules the fade-out), dom.js (cleared in clearOverlay
 *   and effectSelected before starting a new transition).
 *
 * @property {boolean} isLogExpanded
 *   Whether the log box UI panel is expanded.
 *   **Range:** `true` | `false`.
 *   **Used in:** utils.js (updateLogDisplay layout), main.js (toggled on logBox click).
 *
 * @property {number} MATCH_THRESHOLD
 *   face-api recognition distance threshold. A descriptor distance `<=` this value
 *   is classified as a match ("matched"); above it counts as eluded.
 *   **Range:** no enforced bounds. Conventionally an L2 distance in ~0.4–0.6 for
 *   face-api; default `0.58`. Lower = stricter matching.
 *   **Used in:** utils.js (computeMatchState), engine.js (match classification in
 *   findFace), db.js (threshold label), main.js (`Ghostati.getMatchThreshold`).
 *
 * @property {number} MATCH_THRESHOLD_3D
 *   ImageEmbedder cosine-similarity threshold. A similarity `>=` this value is a match.
 *   **Range:** [0, 1]; default `0.85`. Higher = stricter (opposite sign from MATCH_THRESHOLD).
 *   **Used in:** engine-3d.js (match classification in findFace3d/saveFace3d), main.js.
 *
 * @property {Array|null} lastLandmarks3d
 *   Most recent MediaPipe FaceLandmarker result (478 normalised landmarks) from
 *   the current video frame. Cached so engine-3d and plugins can read it without
 *   re-running inference. `null` if MediaPipe has not yet produced a result.
 *   **Used in:** mediapipe-loop.js (written), engine-3d.js (read for compositing),
 *   window.gstmxx.lastLandmarks3d (exposed to plugins).
 *
 * @property {object|null} imageEmbedder
 *   Loaded MediaPipe ImageEmbedder instance. `null` until
 *   `loadMobileNet()` completes in engine-3d.js.
 *   **Used in:** engine-3d.js (getFaceEmbedding, guards).
 *
 * @property {EventTarget} gstmxxEvents
 *   In-app event bus. All cross-module events are dispatched here and exposed to
 *   plugins as `window.gstmxx.events`. Events on this bus: `ready`, `detection`,
 *   `effectChanged`, `effectChanged3d`, `landmarks3d`, `matchStateChanged`,
 *   `beforeEfficacyComposite`, `dbChanged`, `mediapipeReady`. (NB: `ghostatiReady`
 *   is dispatched on `window`, not here.)
 *   **Range:** a single EventTarget instance (never reassigned).
 *   **Used in:** engine.js, ghostyles-manager.js, db.js, main.js (and all add-on
 *   scripts via `window.gstmxx.events`).
 *
 * @property {Map<string, GhostyleEntry>} loadedGhostyles
 *   Registry of loaded 2D ghostyle plugins, keyed by ghostyle id.
 *   **Range:** empty at startup; one entry per successfully loaded ghostyle.
 *   **Used in:** dom.js (addGhostyleBtn populates it; effectSelected/clearActiveEffect
 *   read it), ghostyles-manager.js (toggleEffect/deactivateEffect read it),
 *   engine.js, main.js.
 *
 * @property {boolean} isRecording
 *   True while a 1-second video recording is actively in progress.
 *   **Range:** `true` | `false`.
 *   **Used in:** camera.js (recording control), main.js (button disabling).
 */

/**
 * The shared runtime state singleton.
 * @type {GhostmaxxingState}
 */
export const state = {
   db: null, // initialized after loading via db.loadDb()
   db3d: null, // initialized after loading via db.loadDb3d()
   activeEffect: null,
   effectInferenceInFlight: false,
   lastEffectRun: 0,
   isSystemBusy: false,
   lastKnownEffectResult: null,
   lastCompositedCanvas: null,
   lastLandmarks3d: null, // cached from mediapipe-loop, 478-point normalised array
   imageEmbedder: null, // loaded MediaPipe ImageEmbedder instance
   isMirrored: false,
   currentFacingMode: 'user',
   logsArchive: [],
   visibleLogStartIndex: 0,
   overlayFadeTimeout: null,
   isLogExpanded: false,
   MATCH_THRESHOLD: 0.58,
   MATCH_THRESHOLD_3D: 0.85,
   gstmxxEvents: new EventTarget(),
   loadedGhostyles: new Map(),
   isRecording: false,
};