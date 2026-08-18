/**
 * @module lab-ui
 * @description
 * Presentation controller for the redesigned lab. It does NOT do detection,
 * matching, or saving — the engine (main.js, engine*.js, auto-find-loop.js,
 * ghostyles-manager.js, plugins3d-loader.js) still owns all of that. This
 * module only supplies the new information architecture on top of the engine's
 * existing DOM ids and event bus:
 *
 *   View bar    -> toggles which overlay canvas is visible
 *   Readout     <- engine `matchStateChanged` events
 *   Action rail -> proxies the two pinned Ghostyles to the engine's buttons
 *   Dock        -> routes to Screens (reusing #settingsDrawer / #historyDrawer)
 *   Plugin bar  -> swaps in for the Dock when a command Ghostyle is active
 *   Badges      <- faces via #dbCountBadge (engine), uploads via recordings
 *
 * Everything that reaches into the engine is guarded and marked `INTEGRATION:`
 * where the assumption must be confirmed against live engine behaviour. This
 * file has NOT been run against a camera + models; treat it as a first pass.
 */
import { state } from './state.js';
// Drives which landmark visualisation bbox-overlay paints onto #bboxOverlay.
// INTEGRATION: export name confirmed in bbox-overlay.js (setOverlayMode).
import { setOverlayMode } from './bbox-overlay.js';
import { applyI18n, t } from './i18n.js';
import { initUploadConsentFlow } from './upload-consent.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- icons for the pinned rail slots (heuristic by ghostyle id) ---------- */
const ICONS = {
  brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5 4 20l4 .5.5-4z"/><path d="M15 6l3 3"/><path d="M8.5 15.5 18 6a2.1 2.1 0 0 0-3-3L5.5 12.5"/></svg>',
  stripes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4v16M10 4v16M15 4v16M20 4v16"/></svg>',
  ghost: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8v10.2c0 .9 1 1.4 1.7.8l1.6-1.2 1.7 1.3c.4.3.9.3 1.2 0l1.8-1.3 1.8 1.3c.3.3.8.3 1.2 0l1.7-1.3 1.6 1.2c.7.6 1.7.1 1.7-.8V10a8 8 0 0 0-8-8z"/><circle cx="9.2" cy="10.5" r="1.4" fill="#1a130b"/><circle cx="14.8" cy="10.5" r="1.4" fill="#1a130b"/></svg>'
};
const iconFor = id => /brush/i.test(id) ? ICONS.brush : /strip/i.test(id) ? ICONS.stripes : ICONS.ghost;

/* Ghostyle ids that carry their own bottom-bar controls (brush strokes, stripe
   params, …). INTEGRATION: extend this list / detect it from the plugin
   manifest as command Ghostyles are added. */
const COMMAND_GHOSTYLES = ['brush', 'stripes', 'uv-stripes'];

const els = {
  viewer: $('#viewer'),
  readout: $('#readout'), num: $('#gm-num'), thr: $('#gm-thr'), stateTxt: $('#gm-state'), spark: $('#gm-spark'),
  dock: $('#gm-dock'), pluginbar: $('#gm-pluginbar'), pbTitle: $('#gm-pluginbar-title'), pbClose: $('#gm-pluginbar-close'),
  ghostyles: $('#ghostylesContainer'),
  facesBadge: $('#dbCountBadge'), uploadBadge: $('#gm-upload-badge'), uploadNav: $('#gm-nav-upload'), uploadCount: $('#gm-upload-count'),
  toast: $('#gm-toast'), recdot: $('#gm-recdot')
};

const bus = state && state.gstmxxEvents;   // the engine event target
const THR_DEFAULT = 0.58;
const ui = { pins: [], recordings: 0, THR: THR_DEFAULT, history: [] };

/* ---- toast --------------------------------------------------------------- */
let toastT;
function toast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg; els.toast.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => els.toast.classList.remove('show'), 1600);
}

/* ---- View bar ------------------------------------------------------------ */
// Camera = clean (bbox canvas hidden); 2D points / 3D mesh = bbox-overlay draws
// the corresponding visualisation onto #bboxOverlay. The effect canvases
// (#overlay, #mesh3dOverlay) are never hidden.
const VIEW_TO_MODE = { off: 'bbox', '2d': '2d', '3d': 'mesh' };
function applyView(v) {
  if (els.viewer) els.viewer.dataset.view = v;
  const bbox = document.getElementById('bboxOverlay');
  if (bbox) bbox.classList.toggle('gm-canvas-hidden', v === 'off');
  try { setOverlayMode(VIEW_TO_MODE[v] || 'bbox'); } catch (_) { /* engine not ready */ }
}
$$('.seg').forEach(seg => on(seg, 'click', () => {
  $$('.seg').forEach(s => s.setAttribute('aria-selected', 'false'));
  seg.setAttribute('aria-selected', 'true');
  applyView(seg.dataset.view);
}));

/* ---- Screens (dock routing) --------------------------------------------- */
const SCREENS = { faces: '#historyDrawer', settings: '#settingsDrawer', upload: '#gm-screen-upload', gallery: '#gm-screen-gallery', info: '#gm-screen-info' };
function hideAllScreens() { Object.values(SCREENS).forEach(sel => { const el = $(sel); if (el) el.classList.add('hidden'); }); }
function openScreen(key) {
  const el = $(SCREENS[key]); if (!el) return;
  const wasOpen = !el.classList.contains('hidden');
  hideAllScreens();
  $$('.navbtn').forEach(b => b.setAttribute('aria-current', 'false'));
  if (!wasOpen) {
    el.classList.remove('hidden');
    const btn = $(`.navbtn[data-screen="${key}"]`); if (btn) btn.setAttribute('aria-current', 'true');
    // The engine renders saved faces only on `dbChanged` / its own drawer-open;
    // our IA opens the drawer directly, so nudge a re-render. Safe: bbox-overlay
    // only resets its view when count === 0.
    if (key === 'faces' && bus && state.db) {
      try { bus.dispatchEvent(new CustomEvent('dbChanged', { detail: { count: (state.db.faces || []).length } })); } catch (_) {}
    }
  }
}
$$('.navbtn[data-screen]').forEach(b => on(b, 'click', () => {
  if (b.getAttribute('aria-disabled') === 'true') { toast(t('record_clip_first_toast')); return; }
  openScreen(b.dataset.screen);
}));
// screen close buttons (also bound by the engine; harmless to double-bind)
on($('#closeSettingsBtn'), 'click', () => { hideAllScreens(); $$('.navbtn').forEach(b => b.setAttribute('aria-current', 'false')); });
on($('#closeHistoryBtn'), 'click', () => { hideAllScreens(); $$('.navbtn').forEach(b => b.setAttribute('aria-current', 'false')); });
$$('[data-close-screen]').forEach(b => on(b, 'click', () => { hideAllScreens(); $$('.navbtn').forEach(n => n.setAttribute('aria-current', 'false')); }));
hideAllScreens();

/* ---- Fullscreen / threshold display (Settings) --------------------------- */
on($('#gm-fs'), 'click', () => {
  const t = document.documentElement;
  if (!document.fullscreenElement) {
    (t.requestFullscreen ? t.requestFullscreen() : Promise.reject())
      .then(() => { $('#gm-fs').textContent = t('exit_fullscreen_button'); })
      .catch(() => toast(t('fullscreen_not_available_toast')));
  } else { document.exitFullscreen(); $('#gm-fs').textContent = t('enter_fullscreen_button'); }
});
on($('#gm-thr-input'), 'input', e => {
  const v = parseFloat(e.target.value);
  if (!Number.isFinite(v)) return;
  ui.THR = v;
  if (els.thr) els.thr.textContent = '/ ' + v.toFixed(2);
  // INTEGRATION: this only changes the readout's reference line. To change the
  // engine's real matching threshold, call a setter if the engine exposes one:
  if (window.gstmxx && typeof window.gstmxx.setMatchThreshold === 'function') {
    try { window.gstmxx.setMatchThreshold(v); } catch (_) {}
  }
});

/* ---- Record -> upload gating -------------------------------------------- */
on($('#recordBtn'), 'click', () => {
  if (els.recdot) { els.recdot.classList.add('on'); setTimeout(() => els.recdot.classList.remove('on'), reduce ? 200 : 1600); }
});
if (bus) {
  bus.addEventListener('uploadQueueChanged', (event) => {
    ui.recordings = Number(event.detail && event.detail.count) || 0;
    refreshUploadGate();
  });
}
function refreshUploadGate() {
  if (els.uploadBadge) { els.uploadBadge.hidden = ui.recordings === 0; els.uploadBadge.textContent = ui.recordings; }
  if (els.uploadNav) els.uploadNav.setAttribute('aria-disabled', ui.recordings === 0 ? 'true' : 'false');
  if (els.uploadCount) els.uploadCount.textContent = ui.recordings ? t('clips_ready_to_send', { count: ui.recordings }) : t('no_clips_recorded');
}
initUploadConsentFlow();

/* ---- Pinned Ghostyles on the rail --------------------------------------- */
async function resolvePins() {
  // Prefer ghostyles.json order (so the JSON maintainer controls the defaults).
  try {
    const res = await fetch('ghostyles.json', { cache: 'no-store' });
    if (res.ok) {
      const list = await res.json();
      const ids = (Array.isArray(list) ? list : list.ghostyles || [])
        .map(g => (typeof g === 'string' ? g : g.id)).filter(Boolean)
        .filter(id => id !== '00-template');
      if (ids.length) return ids.slice(0, 2);
    }
  } catch (_) { /* fall through */ }
  // Fallback: first two ghostyle buttons the engine built.
  return $$('.preview-btn[data-effect]', els.ghostyles).slice(0, 2).map(b => b.dataset.effect);
}
function ghostyleName(id) {
  const btn = $(`.preview-btn[data-effect="${id}"]`);
  const t = btn && btn.querySelector('.preview-btn__title');
  return (t && t.textContent.trim()) || (btn && btn.textContent.trim()) || id;
}
function shortCap(name) { return (name || '').split(/\s+/).pop().slice(0, 8) || '—'; }

function updatePinButtonStates() {
  $$('.ghostyle-row').forEach(row => {
    const id = row.dataset.effect;
    const pin1Btn = row.querySelector('.pin-btn--1');
    const pin2Btn = row.querySelector('.pin-btn--2');
    if (pin1Btn) {
      const isPinned1 = ui.pins[0] === id;
      pin1Btn.classList.toggle('active', isPinned1);
      pin1Btn.setAttribute('aria-pressed', isPinned1 ? 'true' : 'false');
    }
    if (pin2Btn) {
      const isPinned2 = ui.pins[1] === id;
      pin2Btn.classList.toggle('active', isPinned2);
      pin2Btn.setAttribute('aria-pressed', isPinned2 ? 'true' : 'false');
    }
  });
}

function paintPins() {
  ui.pins.forEach((id, i) => {
    const n = i + 1;
    const ic = $(`#gm-slot${n}-ic`), cap = $(`#gm-slot${n}-cap`), btn = $(`#gm-slot${n}`);
    const pic = $(`#gm-pin${n}-ic`), pnm = $(`#gm-pin${n}-name`);
    const name = id ? ghostyleName(id) : '—';
    if (ic) ic.innerHTML = id ? iconFor(id) : '';
    if (cap) cap.textContent = id ? shortCap(name) : '—';
    if (btn) { btn.title = name; btn.disabled = !id; }
    if (pic) pic.innerHTML = id ? iconFor(id) : '';
    if (pnm) pnm.textContent = name;
  });
  updatePinButtonStates();
}
function proxyPin(i) {
  const id = ui.pins[i]; if (!id) return;
  const btn = $(`.preview-btn[data-effect="${id}"]`);
  if (btn) btn.click();                 // let the engine toggle the effect
  else toast(t('ghostyle_not_loaded_toast', { id }));
}
on($('#gm-slot1'), 'click', () => proxyPin(0));
on($('#gm-slot2'), 'click', () => proxyPin(1));

function wirePinClicks() {
  on($('#ghostylesContainer'), 'click', e => {
    const pinBtn = e.target.closest('.pin-btn');
    if (!pinBtn) return;
    
    const row = pinBtn.closest('.ghostyle-row');
    if (!row) return;
    const id = row.dataset.effect;
    
    const isPin1 = pinBtn.classList.contains('pin-btn--1');
    const slotIdx = isPin1 ? 0 : 1;
    const slotNum = slotIdx + 1;

    // Turn off previous pinned ghostyle if it was active
    const prevId = ui.pins[slotIdx];
    if (prevId) {
      const prevBtn = $(`.preview-btn[data-effect="${prevId}"]`);
      if (prevBtn && prevBtn.classList.contains('active')) {
        prevBtn.click();
      }
    }

    // If this ghostyle was already in the other slot, clear it from the other slot
    const otherIdx = 1 - slotIdx;
    if (ui.pins[otherIdx] === id) {
      ui.pins[otherIdx] = null;
    }

    // Update this slot
    ui.pins[slotIdx] = id;

    paintPins();
    reflectActive();
    toast(t('pinned_to_slot_toast', { slot: slotNum, name: ghostyleName(id) }));
  });
}

/* Mirror the engine's active ghostyle button state onto the rail slots, and
   swap the Dock for the Plugin bar when a command Ghostyle is on. */
function reflectActive() {
  let activeBarShown = false;
  ui.pins.forEach((id, i) => {
    const eng = $(`.preview-btn[data-effect="${id}"]`);
    const slot = $(`#gm-slot${i + 1}`);
    const active = !!(eng && eng.classList.contains('active'));
    if (slot) slot.classList.toggle('active', active);
    if (active && (COMMAND_GHOSTYLES.includes(id) || hasParamRows())) { showPluginBar(id); activeBarShown = true; }
  });
  if (!activeBarShown) hidePluginBar();
}
function hasParamRows() { const p = $('#plugin3dParamsPanel'); return !!(p && p.querySelector('.pp-row')); }
function showPluginBar(id) {
  if (!els.pluginbar) return;
  els.pluginbar.classList.add('show'); els.pluginbar.setAttribute('aria-hidden', 'false');
  if (els.dock) els.dock.style.display = 'none';
  hideAllScreens();
}
function hidePluginBar() {
  if (!els.pluginbar) return;
  els.pluginbar.classList.remove('show'); els.pluginbar.setAttribute('aria-hidden', 'true');
  if (els.dock) els.dock.style.display = '';
}
// closing the plugin bar turns the active pinned Ghostyle off
on(els.pbClose, 'click', () => {
  ui.pins.forEach(id => { const eng = $(`.preview-btn[data-effect="${id}"]`); if (eng && eng.classList.contains('active')) eng.click(); });
  reflectActive();
});

/* ---- Readout (fed by the engine) ---------------------------------------- */
function currentThreshold() {
  const lbl = $('#thresholdLabel');
  const v = lbl ? parseFloat(lbl.textContent) : NaN;
  return Number.isFinite(v) ? v : ui.THR;
}
function facesCount() { const c = $('#dbCount'); const n = c ? parseInt(c.textContent, 10) : 0; return Number.isFinite(n) ? n : 0; }

function renderReadout(detail) {
  if (!els.readout) return;
  const hasBaseline = facesCount() > 0;
  els.readout.classList.toggle('inert', !hasBaseline);
  const thr = currentThreshold();
  if (els.thr) els.thr.textContent = '/ ' + thr.toFixed(2);
  // Cleared every pass; re-armed below only when the overlay defeats detection
  // entirely. Keeps the "face not found" highlight from sticking across frames.
  els.readout.classList.remove('no-face');

  if (!hasBaseline) { els.num.textContent = '—'; els.stateTxt.textContent = t('save_your_face_status'); return; }

  // The engine's matchStateChanged nests the face-api numbers under
  // detail.faceapi (liveMinDist / obfMinDist / liveMinId / obfMinId).
  const fa = detail && detail.faceapi;
  if (!fa) {
    // no fresh detail (e.g. a dbChanged refresh) — don't claim "no face"
    if (els.num.textContent === '—') els.stateTxt.textContent = t('measuring_status');
    return;
  }
  // Is an obfuscation Ghostyle currently applied? When one is, the only honest
  // measurement is the *composite* (post-overlay) one, and the engine has
  // ALREADY decided matched / unclear / eluded from it. We must trust that
  // decision rather than re-deriving state from a raw number.
  //
  // The bug this guards against: a Ghostyle strong enough to defeat detection
  // produces no composite descriptor at all (obfMinDist === null). The old code
  // then fell through to `liveMinDist` — the pre-overlay live distance — and,
  // because that number is small, mislabelled the strongest possible elusion as
  // "Recognised". A full-face cover must never read as a match.
  const ghostyleOn = !!(detail && detail.ghostylePresent);

  if (ghostyleOn) {
    // detectionState is authoritative: 'eluded' → the overlay worked;
    // 'matched'/'unclear' → the composite still resolves to a saved identity
    // (the overlay did NOT work). Fall back defensively if it's absent.
    let escaped;
    if (fa.detectionState) escaped = fa.detectionState === 'eluded';
    else if (fa.obfMinDist != null) escaped = Number(fa.obfMinDist) >= thr;
    else escaped = true; // Ghostyle on, no composite face found → eluded.

    const id = (fa.obfMinId != null) ? fa.obfMinId : fa.matchedId;
    const who = (id != null) ? ` · #${id}` : '';

    // The composite distance drives the number. When detection was defeated
    // entirely there is no composite descriptor, so there is nothing to show —
    // that is the strongest elusion, rendered as '—', never as a match.
    const cd = (fa.obfMinDist != null) ? Number(fa.obfMinDist) : null;

    // Distinguish the two ways an overlay can "escape": the detector still finds
    // a face but the embedding drifts past threshold (cd is a number), versus
    // the detector losing the face altogether (cd === null). The latter is the
    // strongest result and gets its own highlighted "No face found" state.
    const faceLost = escaped && cd == null;
    els.readout.classList.toggle('no-face', faceLost);

    els.num.textContent = (cd != null) ? cd.toFixed(2) : '—';
    els.readout.classList.toggle('broke', escaped);
    els.stateTxt.textContent = faceLost ? `${t('no_face_found_status')}${who}`
      : escaped ? `${t('escaped_status')}${who}`
        : `${t('recognised_status')}${who}`;
    // Plot the composite distance; when detection was fully defeated, peg the
    // spark to the top of its range so the trace reads as a clear escape.
    pushSpark(cd != null ? cd : 0.9, thr, escaped);
    return;
  }

  // No Ghostyle applied: report the live (pre-overlay) match against the DB.
  const dist = (fa.liveMinDist != null) ? fa.liveMinDist : fa.distance;
  const id = (fa.liveMinId != null) ? fa.liveMinId : fa.matchedId;
  if (dist == null) {
    els.num.textContent = '—'; els.stateTxt.textContent = t('no_face_in_frame_status');
    els.readout.classList.remove('broke'); return;
  }
  const d = Number(dist);
  const broke = d >= thr;
  els.num.textContent = d.toFixed(2);
  els.readout.classList.toggle('broke', broke);
  const who = (id != null) ? ` · #${id}` : '';
  els.stateTxt.textContent = broke ? `${t('escaped_status')}${who}` : `${t('recognised_status')}${who}`;
  pushSpark(d, thr, broke);
}
function pushSpark(v, thr, broke) {
  if (!els.spark) return;
  ui.history.push(v); if (ui.history.length > 40) ui.history.shift();
  const w = 56, h = 16, max = 0.9, min = 0.1, clamp = x => Math.min(max, Math.max(min, x));
  const pts = ui.history.map((d, i) => `${(i / 39 * w).toFixed(1)},${(h - (clamp(d) - min) / (max - min) * h).toFixed(1)}`).join(' ');
  const thrY = h - (clamp(thr) - min) / (max - min) * h;
  els.spark.innerHTML = `<line x1="0" y1="${thrY}" x2="${w}" y2="${thrY}" stroke="#8a7b6a" stroke-width=".7" stroke-dasharray="3 3"/>` +
    `<polyline points="${pts}" fill="none" stroke="${broke ? '#7fe3b0' : '#f3c747'}" stroke-width="1.5"/>`;
}

/* ---- wire the engine event bus ------------------------------------------ */
function wireBus() {
  if (!bus) { console.warn(t('console_lab_ui_bus_missing')); return; }
  bus.addEventListener('matchStateChanged', e => renderReadout(e.detail));
  bus.addEventListener('effectChanged', () => reflectActive());
  bus.addEventListener('dbChanged', () => renderReadout(null));
  // MutationObserver as a backstop for active-state mirroring
  if (els.ghostyles && 'MutationObserver' in window) {
    new MutationObserver(() => { reflectActive(); updatePinButtonStates(); })
      .observe(els.ghostyles, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
  }
}

/* ---- Bug 6: keep Copy always enabled ------------------------------------- */
// The engine disables #copyMakeupBtn when no effect is active (dom.js
// clearActiveEffect); we re-assert it. INTEGRATION: copying with no active
// composite will copy whatever exportMakeup produces (likely the plain frame).
(function keepCopyEnabled() {
  const c = document.getElementById('copyMakeupBtn');
  if (!c) return;
  c.disabled = false;
  if ('MutationObserver' in window) {
    new MutationObserver(() => { if (c.disabled) c.disabled = false; })
      .observe(c, { attributes: true, attributeFilter: ['disabled'] });
  }
})();

/* ---- Bug 4: zoom (wheel + pinch) on the viewer --------------------------- */
// Digital zoom for precise makeup placement. Transforms #viewer (scale+translate).
// Detection still runs on the full raw video; brush coordinates keep mapping
// correctly because they derive from the canvas's own bounding rect.
(function zoomController() {
  const vp = document.getElementById('viewer');
  if (!vp) return;
  const MIN = 1, MAX = 4;
  let z = 1, px = 0, py = 0;
  function clampPan() {
    const w = vp.clientWidth, h = vp.clientHeight;
    px = Math.min(0, Math.max(w * (1 - z), px));
    py = Math.min(0, Math.max(h * (1 - z), py));
  }
  function apply() { clampPan(); vp.style.transform = z <= 1 ? '' : `translate(${px}px,${py}px) scale(${z})`; }
  function zoomAt(clientX, clientY, factor) {
    const r = vp.getBoundingClientRect();
    const cx = clientX - r.left, cy = clientY - r.top;
    const nz = Math.min(MAX, Math.max(MIN, z * factor));
    if (nz === z) return;
    px = cx - (cx - px) * (nz / z); py = cy - (cy - py) * (nz / z); z = nz;
    if (z <= 1) { z = 1; px = 0; py = 0; }
    apply();
  }
  vp.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  vp.addEventListener('dblclick', () => { z = 1; px = 0; py = 0; apply(); });

  const pts = new Map(); let base = null;
  const snap = () => { const [a, b] = [...pts.values()]; return { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2, z, px, py }; };
  vp.addEventListener('pointerdown', e => { pts.set(e.pointerId, e); if (pts.size === 2) base = snap(); });
  vp.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
    if (pts.size === 2 && base) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
      const r = vp.getBoundingClientRect();
      const cx = base.mx - r.left, cy = base.my - r.top;
      z = Math.min(MAX, Math.max(MIN, base.z * (dist / base.dist)));
      px = cx - (cx - base.px) * (z / base.z) + (mx - base.mx);
      py = cy - (cy - base.py) * (z / base.z) + (my - base.my);
      if (z <= 1) { z = 1; px = 0; py = 0; }
      apply();
    }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) base = null; };
  vp.addEventListener('pointerup', up);
  vp.addEventListener('pointercancel', up);
})();

/* ---- boot ---------------------------------------------------------------- */
async function boot() {
  applyI18n();
  applyView('off');
  ui.pins = await resolvePins();
  paintPins(); wirePinClicks(); refreshUploadGate(); renderReadout(null); reflectActive();
}
window.addEventListener('i18n:localeChanged', () => {
  applyI18n();
  refreshUploadGate();
  renderReadout(null);
});
// The engine builds ghostyle buttons during its async init and fires
// `gstmxxReady` on window when state/els/window.gstmxx are ready.
if (window.gstmxx) { wireBus(); boot(); }
else window.addEventListener('gstmxxReady', () => { wireBus(); boot(); }, { once: true });
// If ghostyles load a beat after ready, re-resolve pins shortly after.
setTimeout(() => { if (!ui.pins.filter(Boolean).length) boot(); }, 1500);
