/**
 * @module db
 * @description
 * LocalStorage persistence layer for the two face databases. Holds two parallel
 * stores — one for face-api 128-D recognition descriptors (`STORAGE_KEY`) and
 * one for the MediaPipe ImageEmbedder vectors (`STORAGE_KEY_3D`) — with IDs
 * aligned between them: when `engine.js` assigns an ID at save time, the same
 * ID is passed to `engine-3d.js` so both DBs grow in lockstep.
 *
 * Why two stores instead of one record with two descriptors: it keeps each
 * engine independent. `engine.js` never has to know that a 3D embedding
 * exists, and `engine-3d.js` never has to read or preserve 2D fields it
 * doesn't understand. Disalignment is tolerated (no rollback): if one save
 * fails after the other succeeds, the surviving record is left alone and
 * `findFace` for the missing engine simply returns no match.
 *
 * The 3D DB carries a `modelVersion` field. At load time we compare it with
 * the current `DB3D_MODEL_VERSION`; a mismatch wipes the store automatically,
 * since embeddings produced by different models are not comparable.
 */
import { els } from './dom.js';
import { state } from './state.js';
import { setLog } from './utils.js';
import { clearAllThumbnails } from './face-thumbnails.js';
import { t } from './i18n.js';

/** LocalStorage key for the 2D (face-api) face database. */
export const STORAGE_KEY = 'local-face-lab-db-v1';
/** LocalStorage key for the 3D (ImageEmbedder) face database. */
export const STORAGE_KEY_3D = 'local-face-lab-db-3d-v1';
/**
 * Version tag stamped into the 3D DB. Bumping this string invalidates the
 * stored embeddings on the next load (they will be auto-cleared). Bump it
 * whenever the embedder model or its preprocessing changes in a way that
 * makes old vectors incomparable with new ones.
 */
export const DB3D_MODEL_VERSION = 'image-embedder-v1';

/**
 * Factory for an empty 3D DB shape with the current model version stamped in.
 * Used both for the initial `loadDb3d()` path when no stored data exists and
 * for the auto-wipe path triggered by a model-version mismatch.
 *
 * @returns {{faces: Array, modelVersion: string}}
 */
function createEmptyDb3d() {
   return { faces: [], modelVersion: DB3D_MODEL_VERSION };
}

/**
 * Read the 3D face database from `localStorage`. Returns a fresh empty store
 * if nothing is stored, the JSON is malformed, or the stored model version
 * does not match `DB3D_MODEL_VERSION` (in which case the old data is wiped
 * via `clearDb3d()` because it can no longer be matched against new
 * embeddings).
 *
 * @returns {{faces: Array, modelVersion: string}}
 *   The current 3D DB state. There is no `nextId` field — 3D IDs come from
 *   the 2D DB to keep the two stores aligned.
 * @see lab-js/main.js – called once during init to populate `state.db3d`.
 * @see clearDb3d – called from inside this function when the model version
 *   does not match the stored data.
 */
export function loadDb3d() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY_3D);
      if (!raw) return createEmptyDb3d();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.faces)) return createEmptyDb3d();
      if (parsed.modelVersion !== DB3D_MODEL_VERSION) {
         if (parsed.faces.length > 0) {
            setLog(t('incompatible_3d_db_log'), 'db');
         }
         state.db3d = createEmptyDb3d();
         clearDb3d();
         return state.db3d;
      }
      return parsed;
   } catch {
      return createEmptyDb3d();
   }
}

/**
 * Serialise `state.db3d` to `localStorage` under `STORAGE_KEY_3D`. Called
 * after every successful 3D save so the next reload sees the new embedding.
 *
 * @see lab-js/engine-3d.js – `saveFace3d()` calls this after pushing a record.
 */
export function persistDb3d() {
   localStorage.setItem(STORAGE_KEY_3D, JSON.stringify(state.db3d));
}

/**
 * Reset the 3D DB to an empty store (preserving the current model version)
 * and persist the empty state. Called by `clearDb()` as part of a full
 * cross-engine wipe, and internally by `loadDb3d()` when a model-version
 * mismatch is detected.
 *
 * @see clearDb – orchestrates wiping both DBs together.
 * @see loadDb3d – triggers this on a model-version mismatch.
 */
export function clearDb3d() {
   state.db3d = createEmptyDb3d();
   persistDb3d();
}

/**
 * Read the 2D face database from `localStorage`. Returns a fresh empty store
 * (`{nextId: 0, faces: []}`) if nothing is stored or the JSON is malformed or
 * structurally invalid. `nextId` is the source of truth for the next assigned
 * ID across both engines — the 3D save path reuses it rather than tracking
 * its own counter.
 *
 * @returns {{nextId: number, faces: Array}} The current DB state.
 * @see lab-js/main.js – called once during init to populate `state.db`.
 * @see lab-js/engine.js – `saveFace()` increments and persists `nextId`.
 */
export function loadDb() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { nextId: 0, faces: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.faces) || typeof parsed.nextId !== 'number') {
         return { nextId: 0, faces: [] };
      }
      return parsed;
   } catch {
      return { nextId: 0, faces: [] };
   }
}

/**
 * Serialise `state.db` to `localStorage` and emit a `dbChanged` event on the
 * shared bus so consumers (status badge, bbox overlay) can refresh. Dispatch
 * happens here so every code path that mutates the DB has consistent UI
 * feedback without having to remember to fire the event itself.
 *
 * @see lab-js/engine.js – `saveFace()` calls this after pushing a record.
 * @see clearDb – calls this to persist the empty state and notify listeners.
 * @see tests/unit/db.test.js – verifies persistence and event emission.
 */
export function persistDb() {
   localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
   state.gstmxxEvents.dispatchEvent(new CustomEvent('dbChanged', {
      detail: {
         count: state.db.faces.length,
         nextId: state.db.nextId
      }
   }));
}

/**
 * Push the current DB statistics into the side-panel UI: face count, next ID,
 * the match threshold label, and the badge in the header. Called whenever
 * the DB shape changes or the app starts up.
 *
 * @see lab-js/main.js – `init()` calls this once after loading the DBs.
 * @see clearDb – calls this after wiping the data so the UI shows zero.
 */
export function renderDbStats() {
   els.dbCount.textContent = String(state.db.faces.length);
   els.nextId.textContent = String(state.db.nextId);
   els.thresholdLabel.textContent = state.MATCH_THRESHOLD.toFixed(2);

   els.dbCountBadge.textContent = String(state.db.faces.length);
   // Badge is always shown, even at zero, so users learn where the count
   // lives. Toggling its display made the layout shift on first save.
   els.dbCountBadge.style.display = 'inline-block';
}

/**
 * Wipe both the 2D and 3D face databases, persist the empty state of both,
 * and emit a `matchStateChanged` event (`source: 'clear'`) so any listening
 * UI (bbox overlay, badges) can reset its derived display. The two
 * underlying stores are cleared in lockstep because their IDs are aligned —
 * dropping one without the other would leave orphan records on the next
 * find.
 *
 * @see persistDb – persists the empty 2D state.
 * @see persistDb3d – persists the empty 3D state (called via reassignment).
 * @see renderDbStats – refreshes the on-screen counters.
 * @see tests/unit/db.test.js – covers the cross-DB wipe.
 */
export function clearDb() {
   state.db = { nextId: 0, faces: [] };
   if (state.db3d) state.db3d = createEmptyDb3d();
   persistDb();
   if (state.db3d !== null) persistDb3d();
   clearAllThumbnails();
   state.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: 'unknown', source: 'clear' }
   }));
   setLog(t('local_archive_cleared_log'));
   renderDbStats();
}
