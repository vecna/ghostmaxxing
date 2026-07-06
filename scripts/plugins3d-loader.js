/**
 * @module plugins3d-loader
 * @description
 * Consumer-only runtime for UV rendering.
 *
 * Plugin loading and UI button registration are handled by ghostyles-manager.
 * This module only listens to app events and, when the currently active plugin
 * exports `paintUV`, renders it on the 3D mesh overlay.
 */

import { state } from './state.js';
import { setLog } from './utils.js';
import { createUvRenderer } from './ghostyle3d-uv-renderer.js';
import { clearActiveEffect } from './dom.js';

const runtime = {
   initialized: false,
   canvas: null,
   overlayEl: null,
   panel: null,
   video: null,
   ctx: null,
   events: null,
   renderer: null,
   activePluginId: null,
   paramValues: new Map()
};

/**
 * Writes loader messages to the shared Ghostmaxxing log under the 3D plugin
 * source, so unavailable runtime operations are attributed to this module.
 *
 * @param {string} message - Message to show in the application log.
 * @returns {void}
 * @see reloadPlugins3d - Reports that 3D plugin reloading is delegated to `ghostyles-manager`.
 */
function log3d(message) {
   setLog(message, 'plugins3d');
}

/**
 * Converts thrown plugin failures into the compact label used by loader logs.
 * In this project it keeps broken `paintUV` errors readable while preserving
 * non-Error throws from third-party ghostyles.
 *
 * @param {*} err - Value caught while rendering a 3D ghostyle.
 * @returns {string} Error name and message, or a stringified thrown value.
 * @see deactivateBroken3dPlugin - Formats the `paintUV` failure logged for a disabled plugin.
 */
function asErrorLabel(err) {
   if (err instanceof Error) return `${err.name}: ${err.message}`;
   return String(err);
}

/**
 * Removes a 3D ghostyle from the active UI path after its `paintUV` renderer
 * throws, then broadcasts the same effect-change events used by normal plugin
 * toggles. The user-facing Italian log message means the plugin threw during
 * `paintUV`, and this handler prevents that plugin from breaking subsequent
 * mesh frames.
 *
 * @param {object|null|undefined} entry - Loaded ghostyle entry that failed.
 * @param {*} err - Error or thrown value raised by the plugin renderer.
 * @returns {void}
 * @see initPlugins3dLoader - Called by the `landmarks3d` event listener when UV rendering fails.
 */
function deactivateBroken3dPlugin(entry, err) {
   const pluginId = entry?.id || runtime.activePluginId;
   if (!pluginId) return;

   setLog(`Plugin ${pluginId} ha lanciato: ${asErrorLabel(err)} (paintUV)`, pluginId);
   console.error(`[plugins3d] paintUV errore in ${entry?.name || pluginId}:`, err);

   const btn = document.querySelector(`[data-effect="${pluginId}"]`);
   if (btn) btn.classList.remove('active');

   if (state.activeEffect === pluginId) {
      const previous = pluginId;
      clearActiveEffect();
      runtime.activePluginId = null;
      runtime.events.dispatchEvent(new CustomEvent('effectChanged', {
         detail: { activeEffect: null, previous }
      }));
      runtime.events.dispatchEvent(new CustomEvent('effectChanged3d', {
         detail: { active: null, previous }
      }));
   }
}

/**
 * Guards public 3D control APIs so callers cannot manipulate plugin buttons
 * before the loader has captured its DOM nodes and event bus. The thrown
 * Italian message means `initPlugins3dLoader()` has not been called yet.
 *
 * @returns {void}
 * @throws {Error} When the 3D loader runtime has not been initialized.
 * @see activateEffect3d - Verifies initialization before activating a 3D effect.
 * @see deactivateEffect3d - Verifies initialization before deactivating a 3D effect.
 * @see toggleEffect3d - Verifies initialization before toggling a 3D effect.
 * @see reloadPlugins3d - Verifies initialization before reporting reload availability.
 */
function requireInit() {
   if (!runtime.initialized) {
      throw new Error('[plugins3d] initPlugins3dLoader() non chiamato');
   }
}

/**
 * Keeps the hidden 3D plugin canvas matched to the live overlay dimensions so
 * UV paint is composited into the same coordinate space as the camera frame.
 *
 * @returns {void}
 * @see initPlugins3dLoader - Called on each `landmarks3d` frame before drawing the active ghostyle.
 */
function syncSize() {
   if (runtime.canvas.width !== runtime.overlayEl.width || runtime.canvas.height !== runtime.overlayEl.height) {
      runtime.canvas.width = runtime.overlayEl.width;
      runtime.canvas.height = runtime.overlayEl.height;
   }
}

/**
 * Mirrors the 3D plugin canvas with the main overlay transform, preserving the
 * webcam mirror mode when UV-painted effects are displayed or composited.
 *
 * @returns {void}
 * @see initPlugins3dLoader - Called on each `landmarks3d` frame before drawing the active ghostyle.
 */
function syncMirror() {
   const transform = runtime.overlayEl.style.transform;
   if (runtime.canvas.style.transform !== transform) runtime.canvas.style.transform = transform;
}

/**
 * Clears the 3D plugin canvas between mesh frames or when no UV-capable plugin
 * remains active, avoiding stale painted makeup on the overlay.
 *
 * @returns {void}
 * @see syncActiveEntry - Clears the overlay when the active effect has no `paintUV` renderer.
 * @see initPlugins3dLoader - Clears the overlay before drawing each `landmarks3d` frame.
 */
function clearCanvas() {
   runtime.ctx.clearRect(0, 0, runtime.canvas.width, runtime.canvas.height);
}

/**
 * Normalizes a 3D ghostyle parameter value to the supported project schema
 * (`range`, `bool`, `select`, or RGB `color`) before it is stored for `paintUV`.
 * This keeps panel input values, plugin defaults, and renderer parameters in
 * the same shape regardless of browser form serialization.
 *
 * @param {object} p - Plugin parameter definition.
 * @param {string} p.type - Supported parameter control type.
 * @param {*} p.default - Default value declared by the ghostyle.
 * @param {number} [p.step] - Numeric slider increment.
 * @param {number} [p.min] - Numeric slider minimum.
 * @param {number} [p.max] - Numeric slider maximum.
 * @param {Array<*>} [p.options] - Selectable values for `select` parameters.
 * @param {*} value - Raw value from the plugin manifest or parameter control.
 * @returns {*} Coerced value ready to pass to the active ghostyle.
 * @see ensureParamValues - Coerces initial plugin defaults.
 * @see createParamRow - Coerces values read from parameter panel controls.
 */
function coerceParam(p, value) {
   if (p.type === 'range') {
      let v = (typeof value === 'number') ? value : parseFloat(value);
      if (!Number.isFinite(v)) v = p.default;
      const step = (typeof p.step === 'number') ? p.step : 0.01;
      if (Number.isInteger(step) && step >= 1) v = Math.round(v);
      if (typeof p.min === 'number') v = Math.max(p.min, v);
      if (typeof p.max === 'number') v = Math.min(p.max, v);
      return v;
   }

   if (p.type === 'bool') return Boolean(value);

   if (p.type === 'select') {
      const opts = Array.isArray(p.options) ? p.options : [];
      return opts.includes(value) ? value : p.default;
   }

   if (p.type === 'color') {
      if (Array.isArray(value) && value.length === 3) {
         return value.map((c) => {
            const n = Math.round(Number(c));
            return Math.max(0, Math.min(255, Number.isFinite(n) ? n : 0));
         });
      }

      if (typeof value === 'string') {
         const short = /^#([0-9a-fA-F]{3})$/.exec(value);
         if (short) {
            const c = short[1];
            return [
               parseInt(c[0] + c[0], 16),
               parseInt(c[1] + c[1], 16),
               parseInt(c[2] + c[2], 16)
            ];
         }

         if (/^#[0-9a-fA-F]{6}$/.test(value)) {
            return [
               parseInt(value.slice(1, 3), 16),
               parseInt(value.slice(3, 5), 16),
               parseInt(value.slice(5, 7), 16)
            ];
         }
      }

      return value === p.default ? [0, 0, 0] : coerceParam(p, p.default);
   }

   return value;
}

/**
 * Converts a stored RGB array from the 3D parameter map into a browser color
 * input value, clamping invalid plugin-provided components to black-safe
 * channel values.
 *
 * @param {number[]} rgb - RGB triplet stored for a color parameter.
 * @returns {string} Hex color string used by the parameter panel.
 * @see createParamRow - Initializes and updates color controls for 3D ghostyle parameters.
 */
function rgbToHex(rgb) {
   if (!Array.isArray(rgb) || rgb.length < 3) return '#000000';
   return '#' + rgb.slice(0, 3).map((c) => {
      const n = Math.max(0, Math.min(255, Math.round(Number(c) || 0)));
      return n.toString(16).padStart(2, '0');
   }).join('');
}

/**
 * Creates the per-plugin parameter state used by `paintUV`, seeded from the
 * ghostyle module defaults only once per plugin so user adjustments survive
 * ordinary active-effect refreshes.
 *
 * @param {string} id - Loaded ghostyle identifier.
 * @param {object} module - Ghostyle module that may expose configurable UV parameters.
 * @param {Array<object>} [module.params] - Parameter definitions declared by the ghostyle.
 * @returns {void}
 * @see syncActiveEntry - Ensures parameters exist whenever a UV-capable ghostyle becomes active.
 */
function ensureParamValues(id, module) {
   if (!Array.isArray(module.params) || module.params.length === 0) {
      runtime.paramValues.delete(id);
      return;
   }

   if (runtime.paramValues.has(id)) return;

   const values = {};
   for (const p of module.params) values[p.name] = coerceParam(p, p.default);
   runtime.paramValues.set(id, values);
}

/**
 * Publishes the parameter panel height into the `--pp-h` CSS variable so the
 * rest of the lab UI can reserve space when 3D ghostyle controls are visible.
 *
 * @returns {void}
 * @see hideParamsPanel - Resets the CSS variable when controls are hidden.
 * @see renderParamsPanel - Updates the CSS variable after rendering controls.
 */
function syncPanelHeightVar() {
   const h = runtime.panel.classList.contains('visible') ? runtime.panel.offsetHeight + 12 : 0;
   document.documentElement.style.setProperty('--pp-h', h + 'px');
}

/**
 * Builds one row in the floating 3D parameter panel for a ghostyle manifest
 * parameter, wiring browser controls back into the runtime value map that is
 * later passed to `paintUV`.
 *
 * @param {string} pluginId - Loaded ghostyle identifier whose values should be edited.
 * @param {object} p - Parameter definition from the ghostyle module.
 * @param {string} p.name - Runtime parameter key passed to `paintUV`.
 * @param {string} [p.label] - Visible label used in the panel.
 * @param {string} p.type - Supported parameter control type.
 * @param {number} [p.min] - Numeric slider minimum.
 * @param {number} [p.max] - Numeric slider maximum.
 * @param {number} [p.step] - Numeric slider increment.
 * @param {Array<*>} [p.options] - Selectable values for `select` parameters.
 * @returns {HTMLDivElement|null} Parameter row, or null when the type cannot be rendered.
 * @see renderParamsPanel - Creates rows for the active 3D ghostyle parameter list.
 */
function createParamRow(pluginId, p) {
   const values = runtime.paramValues.get(pluginId);
   if (!values) return null;

   const row = document.createElement('div');
   row.className = 'pp-row';

   const label = document.createElement('label');
   label.className = 'pp-label';
   label.textContent = p.label || p.name;
   row.appendChild(label);

   const ctrlWrap = document.createElement('div');
   ctrlWrap.className = 'pp-control';

   if (p.type === 'range') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step || 0.01);
      input.value = String(values[p.name]);

      const valueLabel = document.createElement('span');
      valueLabel.className = 'pp-value';
      const fmt = (v) => (Number(p.step) >= 1 ? String(v) : Number(v).toFixed(2));
      valueLabel.textContent = fmt(values[p.name]);

      input.addEventListener('input', () => {
         const v = coerceParam(p, input.value);
         values[p.name] = v;
         valueLabel.textContent = fmt(v);
      });

      ctrlWrap.appendChild(input);
      row.appendChild(ctrlWrap);
      row.appendChild(valueLabel);
      return row;
   }

   if (p.type === 'bool') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(values[p.name]);
      input.addEventListener('input', () => {
         values[p.name] = coerceParam(p, input.checked);
      });
      ctrlWrap.appendChild(input);
      row.appendChild(ctrlWrap);
      return row;
   }

   if (p.type === 'select') {
      const select = document.createElement('select');
      for (const opt of (p.options || [])) {
         const o = document.createElement('option');
         o.value = String(opt);
         o.textContent = String(opt);
         if (opt === values[p.name]) o.selected = true;
         select.appendChild(o);
      }
      select.addEventListener('input', () => {
         values[p.name] = coerceParam(p, select.value);
      });
      ctrlWrap.appendChild(select);
      row.appendChild(ctrlWrap);
      return row;
   }

   if (p.type === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = rgbToHex(values[p.name]);

      const valueLabel = document.createElement('span');
      valueLabel.className = 'pp-value';
      valueLabel.textContent = rgbToHex(values[p.name]);

      input.addEventListener('input', () => {
         values[p.name] = coerceParam(p, input.value);
         valueLabel.textContent = rgbToHex(values[p.name]);
      });

      ctrlWrap.appendChild(input);
      row.appendChild(ctrlWrap);
      row.appendChild(valueLabel);
      return row;
   }

   return null;
}

/**
 * Hides and empties the 3D parameter panel when no UV-capable ghostyle is
 * active, or when the active ghostyle has no configurable parameters.
 *
 * @returns {void}
 * @see renderParamsPanel - Delegates here for plugins without parameters.
 * @see syncActiveEntry - Hides controls when the active effect is not a 3D renderer.
 */
function hideParamsPanel() {
   runtime.panel.classList.remove('visible');
   runtime.panel.setAttribute('aria-hidden', 'true');
   runtime.panel.innerHTML = '';
   syncPanelHeightVar();
}

/**
 * Renders the floating parameter panel for the active UV ghostyle. The existing
 * Italian heading "Parametri" is the visible label for plugin controls and is
 * generated here together with the active plugin name.
 *
 * @param {object|null|undefined} entry - Active loaded ghostyle entry.
 * @returns {void}
 * @see syncActiveEntry - Refreshes the panel whenever the active effect changes.
 */
function renderParamsPanel(entry) {
   runtime.panel.innerHTML = '';
   if (!entry || !Array.isArray(entry.module.params) || entry.module.params.length === 0) {
      hideParamsPanel();
      return;
   }

   const title = document.createElement('div');
   title.className = 'pp-header';
   title.textContent = `Parametri - ${entry.name}`;
   runtime.panel.appendChild(title);

   for (const p of entry.module.params) {
      const row = createParamRow(entry.id, p);
      if (row) runtime.panel.appendChild(row);
   }

   runtime.panel.classList.add('visible');
   runtime.panel.classList.remove('collapsed');
   runtime.panel.setAttribute('aria-hidden', 'false');
   requestAnimationFrame(syncPanelHeightVar);
}

/**
 * Resolves the current global active effect to a loaded ghostyle entry only
 * when that module exports the `paintUV` hook required by the 3D mesh overlay.
 *
 * @returns {object|null} Active UV-capable ghostyle entry.
 * @see syncActiveEntry - Uses this lookup to align runtime state with `state.activeEffect`.
 */
function getActivePaintEntry() {
   const activeId = state.activeEffect;
   if (!activeId) return null;

   const entry = state.loadedGhostyles.get(activeId);
   if (!entry || !entry.module || typeof entry.module.paintUV !== 'function') return null;

   return entry;
}

/**
 * Synchronizes loader state after a ghostyle effect change by selecting the
 * active `paintUV` entry, preparing its parameters, refreshing controls, and
 * notifying listeners through `effectChanged3d`.
 *
 * @returns {void}
 * @see initPlugins3dLoader - Called during initialization and by the `effectChanged` event listener.
 */
function syncActiveEntry() {
   const prev = runtime.activePluginId;
   const entry = getActivePaintEntry();
   runtime.activePluginId = entry ? entry.id : null;

   if (entry) {
      ensureParamValues(entry.id, entry.module);
      renderParamsPanel(entry);
   } else {
      hideParamsPanel();
      clearCanvas();
   }

   if (prev !== runtime.activePluginId) {
      runtime.events.dispatchEvent(new CustomEvent('effectChanged3d', {
         detail: { active: runtime.activePluginId, previous: prev }
      }));
   }
}

/**
 * Returns the active 3D ghostyle id tracked by this loader, or null when the
 * current active effect is not a UV-capable plugin.
 *
 * @returns {string|null} Active 3D plugin id.
 * @see main - Exposed as `window.gstmxx.getActiveEffect3d`.
 * @see hasActivePlugin - Checks whether 2D or 3D compositing should run.
 * @see hasActivePlugin3d - Checks active plugin state before 3D efficacy compositing.
 */
export function getActiveEffect3d() {
   return runtime.activePluginId;
}

/**
 * Activates a UV-capable ghostyle by delegating to its existing effect button,
 * keeping 3D activation on the same UI path as regular ghostyle toggles.
 *
 * @param {string} id - Loaded ghostyle id to activate.
 * @returns {boolean} True when a matching clickable 3D effect button was triggered.
 * @see main - Exposed as `window.gstmxx.activateEffect3d`.
 * @see toggleEffect3d - Uses this when the requested 3D plugin is not already active.
 */
export function activateEffect3d(id) {
   requireInit();
   const entry = state.loadedGhostyles.get(id);
   if (!entry || typeof entry.module?.paintUV !== 'function') return false;
   const btn = document.querySelector(`[data-effect="${id}"]`);
   if (!btn || typeof btn.click !== 'function') return false;
   btn.click();
   return true;
}

/**
 * Deactivates the current UV-capable ghostyle by clicking the active effect
 * button, preserving the unified active-effect behavior owned by the UI.
 *
 * @returns {boolean} True when the active 3D effect button was triggered.
 * @see main - Exposed as `window.gstmxx.deactivateEffect3d`.
 * @see toggleEffect3d - Uses this when the requested 3D plugin is already active.
 */
export function deactivateEffect3d() {
   requireInit();
   if (!state.activeEffect || state.activeEffect !== runtime.activePluginId) return false;
   const btn = document.querySelector(`[data-effect="${state.activeEffect}"]`);
   if (!btn || typeof btn.click !== 'function') return false;
   btn.click();
   return true;
}

/**
 * Toggles a UV-capable ghostyle through the shared effect-button workflow,
 * activating it when inactive and deactivating it when it is already selected.
 *
 * @param {string} id - Loaded ghostyle id to toggle.
 * @returns {boolean} True when a matching UI button was triggered.
 * @see main - Exposed as `window.gstmxx.toggleEffect3d`.
 */
export function toggleEffect3d(id) {
   requireInit();
   if (runtime.activePluginId === id) return deactivateEffect3d();
   return activateEffect3d(id);
}

/**
 * Compatibility hook for older 3D plugin callers. In the current project,
 * plugin discovery and reloads are handled by `ghostyles-manager`, so this
 * function logs that 3D-specific reload is not available and returns false.
 *
 * @returns {boolean} Always false because 3D plugins are managed by `ghostyles-manager`.
 * @see main - Exposed as `window.gstmxx.reloadPlugins3d`.
 */
export function reloadPlugins3d() {
   requireInit();
   log3d('reloadPlugins3d non disponibile: i plugin sono gestiti da ghostyles-manager.');
   return false;
}

/**
 * Initializes the 3D plugin runtime by binding the overlay canvas, parameter
 * panel, app event bus, and UV renderer. It then listens for active-effect,
 * compositing, and MediaPipe landmark events so loaded ghostyles with `paintUV`
 * can draw onto the mesh overlay without owning plugin loading themselves.
 *
 * @param {object} [options={}] - DOM id and renderer overrides used by startup and tests.
 * @param {string} [options.canvasId='mesh3dOverlay'] - Canvas receiving rendered UV makeup.
 * @param {string} [options.overlayId='overlay'] - Main overlay whose size and mirror transform are followed.
 * @param {string} [options.panelId='plugin3dParamsPanel'] - Floating panel for active plugin parameters.
 * @param {string} [options.videoId='video'] - Webcam video element required by the runtime.
 * @param {string} [options.baseUrl] - Base URL for resolving the canonical UV data file.
 * @param {string} [options.uvPath] - Explicit URL for `face_canonical_uv.json`.
 * @param {Function} [options.getFaceLandmarker] - Provider for the MediaPipe FaceLandmarker instance.
 * @returns {object} Initialized singleton runtime.
 * @throws {Error} When the required DOM elements are missing.
 * @see main - Called during application startup before `ghostyles-manager` loads unified ghostyles.
 */
export function initPlugins3dLoader(options = {}) {
   if (runtime.initialized) return runtime;

   runtime.canvas = document.getElementById(options.canvasId || 'mesh3dOverlay');
   runtime.overlayEl = document.getElementById(options.overlayId || 'overlay');
   runtime.panel = document.getElementById(options.panelId || 'plugin3dParamsPanel');
   runtime.video = document.getElementById(options.videoId || 'video');

   if (!runtime.canvas || !runtime.overlayEl || !runtime.panel || !runtime.video) {
      throw new Error('[plugins3d] elementi DOM mancanti');
   }

   runtime.ctx = runtime.canvas.getContext('2d');
   runtime.events = state.gstmxxEvents;

   const relurl = options.baseUrl || window.location.pathname.split('/').slice(0, -1).join('/');
   const uvPath = options.uvPath || (relurl + '/data/face_canonical_uv.json');
   runtime.renderer = createUvRenderer({
      uvPath,
      getFaceLandmarker: options.getFaceLandmarker || (() => (window.gstmxx && window.gstmxx.FaceLandmarker) || null),
      log: (message) => setLog(message, 'uv-renderer')
   });
   runtime.renderer.ensureLoaded();

   runtime.events.addEventListener('effectChanged', () => {
      syncActiveEntry();
   });

   runtime.events.addEventListener('beforeEfficacyComposite', (e) => {
      const detail = e.detail || {};
      if (!runtime.activePluginId || !detail.canvas || !detail.ctx) return;
      detail.ctx.drawImage(runtime.canvas, 0, 0, detail.canvas.width, detail.canvas.height);
   });

   runtime.events.addEventListener('beforeEfficacyComposite3d', (e) => {
      const detail = e.detail || {};
      if (!runtime.activePluginId || !detail.canvas || !detail.ctx) return;
      detail.ctx.drawImage(runtime.canvas, 0, 0, detail.canvas.width, detail.canvas.height);
   });

   runtime.events.addEventListener('landmarks3d', (e) => {
      const landmarks = e.detail && e.detail.landmarks;
      syncSize();
      syncMirror();
      clearCanvas();

      if (!runtime.activePluginId || !landmarks) return;
      const entry = state.loadedGhostyles.get(runtime.activePluginId);
      if (!entry || typeof entry.module?.paintUV !== 'function') return;

      try {
         runtime.ctx.save();
         runtime.renderer.render(entry.module, runtime.ctx, landmarks, runtime.paramValues.get(runtime.activePluginId) || {});
         runtime.ctx.restore();
      } catch (err) {
         deactivateBroken3dPlugin(entry, err);
      }
   });

   runtime.initialized = true;
   syncActiveEntry();
   return runtime;
}
