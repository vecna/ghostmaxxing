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

function log3d(message) {
   setLog(message, 'plugins3d');
}

function asErrorLabel(err) {
   if (err instanceof Error) return `${err.name}: ${err.message}`;
   return String(err);
}

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

function requireInit() {
   if (!runtime.initialized) {
      throw new Error('[plugins3d] initPlugins3dLoader() non chiamato');
   }
}

function syncSize() {
   if (runtime.canvas.width !== runtime.overlayEl.width || runtime.canvas.height !== runtime.overlayEl.height) {
      runtime.canvas.width = runtime.overlayEl.width;
      runtime.canvas.height = runtime.overlayEl.height;
   }
}

function syncMirror() {
   const transform = runtime.overlayEl.style.transform;
   if (runtime.canvas.style.transform !== transform) runtime.canvas.style.transform = transform;
}

function clearCanvas() {
   runtime.ctx.clearRect(0, 0, runtime.canvas.width, runtime.canvas.height);
}

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

function rgbToHex(rgb) {
   if (!Array.isArray(rgb) || rgb.length < 3) return '#000000';
   return '#' + rgb.slice(0, 3).map((c) => {
      const n = Math.max(0, Math.min(255, Math.round(Number(c) || 0)));
      return n.toString(16).padStart(2, '0');
   }).join('');
}

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

function syncPanelHeightVar() {
   const h = runtime.panel.classList.contains('visible') ? runtime.panel.offsetHeight + 12 : 0;
   document.documentElement.style.setProperty('--pp-h', h + 'px');
}

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

function hideParamsPanel() {
   runtime.panel.classList.remove('visible');
   runtime.panel.setAttribute('aria-hidden', 'true');
   runtime.panel.innerHTML = '';
   syncPanelHeightVar();
}

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

function getActivePaintEntry() {
   const activeId = state.activeEffect;
   if (!activeId) return null;

   const entry = state.loadedGhostyles.get(activeId);
   if (!entry || !entry.module || typeof entry.module.paintUV !== 'function') return null;

   return entry;
}

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

export function getActiveEffect3d() {
   return runtime.activePluginId;
}

export function activateEffect3d(id) {
   requireInit();
   const entry = state.loadedGhostyles.get(id);
   if (!entry || typeof entry.module?.paintUV !== 'function') return false;
   const btn = document.querySelector(`[data-effect="${id}"]`);
   if (!btn || typeof btn.click !== 'function') return false;
   btn.click();
   return true;
}

export function deactivateEffect3d() {
   requireInit();
   if (!state.activeEffect || state.activeEffect !== runtime.activePluginId) return false;
   const btn = document.querySelector(`[data-effect="${state.activeEffect}"]`);
   if (!btn || typeof btn.click !== 'function') return false;
   btn.click();
   return true;
}

export function toggleEffect3d(id) {
   requireInit();
   if (runtime.activePluginId === id) return deactivateEffect3d();
   return activateEffect3d(id);
}

export function reloadPlugins3d() {
   requireInit();
   log3d('reloadPlugins3d non disponibile: i plugin sono gestiti da ghostyles-manager.');
   return false;
}

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
