/**
 * @module realtime-settings
 * @description
 * The bottom bar over the video stage, plus the persistence behind it.
 *
 * The match threshold is deliberately NOT adjustable here. 0.60 is the one
 * number on this page with a citable provenance — dlib's default, measured on
 * LFW — and a moved threshold means nothing at all. The information lives in
 * the measured noise floor and in how far the trace climbs above it, not in
 * where an operator decided to drag a line.
 *
 * The brightness control is display only. face-api reads raw frames from the
 * video element and CSS filters apply at composite, so turning this dial cannot
 * change a descriptor. That is stated in the control's tooltip so nobody later
 * reads an exposure change as a lighting-robustness result.
 */

import { createFaceArchive } from '../face-archive.js';

const SETTINGS_KEY = 'gstmxx.realtime.settings';
const BASELINE_FORMAT = 1;
const CONDITION_KEYS = [
  'rollDegrees',
  'yawOffset',
  'boxWidthRatio',
  'centerXRatio',
  'centerYRatio',
  'luma',
];

const DEFAULT_SETTINGS = {
  brightness: 0.85,
  equalizer: true,
};

/**
 * Reads persisted view settings.
 *
 * @returns {{brightness: number, equalizer: boolean}} Stored or default settings.
 */
export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      brightness: Number.isFinite(parsed.brightness) ? parsed.brightness : DEFAULT_SETTINGS.brightness,
      equalizer: typeof parsed.equalizer === 'boolean' ? parsed.equalizer : DEFAULT_SETTINGS.equalizer,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persists view settings.
 *
 * @param {object} settings Settings to store.
 * @returns {void}
 */
export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Storage disabled or full; settings simply do not persist. */
  }
}

/**
 * Restores the active camera baseline and validates the Realtime calibration.
 * @param {object} [archive] Shared archive, injectable for tests.
 * @returns {object|null} Valid camera baseline including its descriptor.
 */
export function loadBaseline(archive = createFaceArchive()) {
  const { activeRealtimeId, faces } = archive.read();
  const face = faces.find(record => record.id === activeRealtimeId);
  const calibration = face?.realtime;
  if (calibration?.format !== BASELINE_FORMAT || calibration.sourceKind !== 'camera') return null;
  const { capturedAt, noiseFloor, conditions, guide } = calibration;
  if (!Number.isFinite(capturedAt) || !Number.isFinite(noiseFloor)) return null;
  if (!conditions || CONDITION_KEYS.some(key => !Number.isFinite(conditions[key]))) return null;
  if (
    !Number.isFinite(guide?.aspectRatio) ||
    !guide.box ||
    ['x', 'y', 'width', 'height'].some(key => !Number.isFinite(guide.box[key])) ||
    !Array.isArray(guide.landmarks) ||
    guide.landmarks.length !== 68 ||
    guide.landmarks.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))
  ) return null;
  return { ...calibration, descriptor: face.descriptor, archiveId: face.id };
}

/**
 * Saves a camera baseline as a numbered face shared with Lab.
 * @param {object} baseline Camera descriptor and calibration.
 * @param {object} [archive] Shared archive, injectable for tests.
 * @returns {Promise<object|null>} The saved face, or null for session-only references.
 */
export async function saveBaseline(baseline, archive = createFaceArchive()) {
  const { descriptor, capturedAt, sourceKind, thumbnail, noiseFloor, conditions, guide } = baseline;
  if (sourceKind !== 'camera') return null;
  try {
    return await archive.save({
      descriptor,
      savedAt: new Date(capturedAt).toISOString(),
      thumbnail,
      realtime: { format: BASELINE_FORMAT, sourceKind, capturedAt, noiseFloor, conditions, guide },
    });
  } catch (error) {
    console.warn('Could not save the Realtime baseline to the face archive', error);
    return null;
  }
}

/**
 * Detaches the active camera baseline, deleting its face on explicit reset.
 * @param {object} [options] Session reference and storage.
 * @param {?number} [options.id] ID used by this session.
 * @param {boolean} [options.removeFace=false] True when the user confirms Reset baseline.
 * @param {object} [options.archive] Shared archive, injectable for tests.
 * @returns {Promise<void>}
 */
export async function clearBaseline({ id, removeFace = false, archive = createFaceArchive() } = {}) {
  try {
    await archive.clearRealtime({ id, removeFace });
  } catch (error) {
    console.warn('Could not clear the Realtime baseline', error);
  }
}

/**
 * Wraps a destructive button in a two-step confirmation.
 *
 * Deleting a baseline mid-session costs the whole session, and "Delete all"
 * costs every capture on the device. Neither should be one stray click.
 *
 * @param {HTMLButtonElement} button Button to guard.
 * @param {string} idleLabel Label in the resting state.
 * @param {string} confirmLabel Label while awaiting confirmation.
 * @param {function(): void} onConfirm Action to run on the second click.
 * @param {number} [timeoutMs] Time before the button reverts.
 * @returns {object} Guard handle exposing `reset()`.
 */
export function guardDestructive(button, idleLabel, confirmLabel, onConfirm, timeoutMs = 4000) {
  let armed = false;
  let timer = null;

  /**
   * Returns the button to its resting label.
   *
   * @returns {void}
   */
  function reset() {
    armed = false;
    button.textContent = idleLabel;
    button.classList.remove('is-confirming');
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      button.classList.add('is-confirming');
      timer = window.setTimeout(reset, timeoutMs);
      return;
    }
    reset();
    onConfirm();
  });

  return { reset };
}

/**
 * Creates the settings bar controller.
 *
 * @param {object} options Wiring options.
 * @param {HTMLElement} options.rootEl Element carrying the --rt-* custom properties.
 * @param {HTMLInputElement} options.brightnessEl Brightness range input.
 * @param {HTMLElement} options.brightnessValueEl Brightness readout.
 * @param {HTMLButtonElement} options.equalizerEl Equalizer switch.
 * @param {HTMLElement} options.layoutEl Grid root toggled by the equalizer switch.
 * @param {function(): void} options.onLayoutChange Called after a layout-affecting change.
 * @returns {object} Settings controller.
 */
export function createSettings(options) {
  const {
    rootEl,
    brightnessEl,
    brightnessValueEl,
    equalizerEl,
    layoutEl,
    onLayoutChange,
  } = options;

  const settings = loadSettings();

  /**
   * Applies the brightness value to the stage and the readout.
   *
   * @returns {void}
   */
  function applyBrightness() {
    rootEl.style.setProperty('--rt-brightness', String(settings.brightness));
    brightnessEl.value = String(settings.brightness);
    brightnessValueEl.textContent = settings.brightness.toFixed(2);
  }

  /**
   * Applies equalizer visibility to the grid.
   *
   * Hiding the right column resizes the left one without firing a window
   * resize event, which is why the graph observes its own container rather
   * than listening on window alone.
   *
   * @returns {void}
   */
  function applyEqualizer() {
    layoutEl.classList.toggle('hide-equalizer', !settings.equalizer);
    equalizerEl.setAttribute('aria-checked', String(settings.equalizer));
  }

  brightnessEl.addEventListener('input', () => {
    settings.brightness = Number(brightnessEl.value);
    applyBrightness();
    saveSettings(settings);
  });

  equalizerEl.addEventListener('click', () => {
    settings.equalizer = !settings.equalizer;
    applyEqualizer();
    saveSettings(settings);
    if (typeof onLayoutChange === 'function') onLayoutChange();
  });

  equalizerEl.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    equalizerEl.click();
  });

  applyBrightness();
  applyEqualizer();

  return {
    /**
     * Returns the live settings object.
     *
     * @returns {{brightness: number, equalizer: boolean}} Current settings.
     */
    values() {
      return settings;
    },
  };
}
