import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ applyI18n: vi.fn(), setOverlayMode: vi.fn(), initUploadConsentFlow: vi.fn() }));
vi.mock('../../lab-js/i18n.js', () => ({ applyI18n: deps.applyI18n, t: key => key }));
vi.mock('../../lab-js/bbox-overlay.js', () => ({ setOverlayMode: deps.setOverlayMode }));
vi.mock('../../lab-js/upload-consent.js', () => ({ initUploadConsentFlow: deps.initUploadConsentFlow }));

import { state } from '../../lab-js/state.js';

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
}

function fire(target, type, values = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}

function match(detail) {
  state.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', { detail }));
}

function addGhostyle(id, title = id) {
  const row = document.createElement('div');
  row.className = 'ghostyle-row';
  row.dataset.effect = id;
  const pin1 = document.createElement('button');
  pin1.className = 'pin-btn pin-btn--1';
  const pin2 = document.createElement('button');
  pin2.className = 'pin-btn pin-btn--2';
  const engine = document.createElement('button');
  engine.className = 'preview-btn';
  engine.dataset.effect = id;
  engine.innerHTML = `<span class="preview-btn__title">${title}</span>`;
  engine.addEventListener('click', () => engine.classList.toggle('active'));
  row.append(pin1, pin2, engine);
  document.getElementById('ghostylesContainer').appendChild(row);
  return { row, pin1, pin2, engine };
}

describe('lab-ui', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('boots against the lab page and drives its presentation interactions', async () => {
    vi.useFakeTimers();
    const source = readFileSync(`${process.cwd()}/lab.html`, 'utf8');
    document.body.innerHTML = new DOMParser().parseFromString(source, 'text/html').body.innerHTML;
    for (const id of ['closeSettingsBtn', 'closeHistoryBtn']) {
      if (!document.getElementById(id)) {
        const button = document.createElement('button');
        button.id = id;
        document.body.appendChild(button);
      }
    }
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const thresholdSetter = vi.fn();
    window.gstmxx = { setMatchThreshold: thresholdSetter };
    state.gstmxxEvents = new EventTarget();
    state.db = { faces: [{ id: 1 }] };
    state.db3d = { faces: [] };
    document.getElementById('dbCount').textContent = '1';
    document.getElementById('thresholdLabel').textContent = '0.58';

    const brush = addGhostyle('brush', 'Bold Brush Style');
    const stripes = addGhostyle('stripes', 'UV Stripes');
    const ghost = addGhostyle('other-style', 'Another Style');
    document.getElementById('ghostylesContainer').insertAdjacentHTML('beforeend', '<div class="ghostyle-row" data-effect="empty"></div>');
    document.getElementById('gm-slot1-cap').insertAdjacentHTML('afterend', '<span id="gm-pin1-ic"></span><span id="gm-pin1-name"></span>');
    document.getElementById('gm-slot2-cap').insertAdjacentHTML('afterend', '<span id="gm-pin2-ic"></span><span id="gm-pin2-name"></span>');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [{ id: 'brush' }, 'stripes', '00-template'],
    })));
    deps.setOverlayMode.mockImplementation(mode => mode);

    const labUi = await import('../../lab-js/lab-ui.js?lab-page');
    expect(labUi.shortCap('')).toBe('—');
    await flushPromises();
    expect(deps.applyI18n).toHaveBeenCalled();
    expect(document.getElementById('viewer').dataset.view).toBe('off');
    expect(document.getElementById('gm-slot1-cap').textContent).toBe('Style');
    expect(document.getElementById('gm-slot2-cap').textContent).toBe('Stripes');

    for (const segment of document.querySelectorAll('.seg')) segment.click();
    expect(document.getElementById('bboxOverlay').classList.contains('gm-canvas-hidden')).toBe(false);
    deps.setOverlayMode.mockImplementationOnce(() => { throw new Error('overlay not ready'); });
    document.querySelector('.seg[data-view="2d"]').click();
    document.querySelector('.seg[data-view="3d"]').click();

    const fullscreen = document.getElementById('gm-fs');
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve());
    fullscreen.click();
    await flushPromises();
    expect(fullscreen.textContent).toBe('exit_fullscreen_button');
    delete document.documentElement.requestFullscreen;
    document.documentElement.webkitRequestFullscreen = vi.fn(() => Promise.resolve());
    fullscreen.click();
    await flushPromises();
    delete document.documentElement.webkitRequestFullscreen;
    document.documentElement.msRequestFullscreen = vi.fn(() => Promise.resolve());
    fullscreen.click();
    await flushPromises();
    delete document.documentElement.msRequestFullscreen;
    fullscreen.click();
    await flushPromises();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: {} });
    document.exitFullscreen = vi.fn();
    fullscreen.click();
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    delete document.exitFullscreen;

    const thresholdInput = document.getElementById('gm-thr-input');
    thresholdInput.value = '0.72';
    thresholdInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(thresholdSetter).toHaveBeenCalledWith(0.72);
    thresholdSetter.mockImplementationOnce(() => { throw new Error('readonly'); });
    thresholdInput.dispatchEvent(new Event('input', { bubbles: true }));
    window.gstmxx = {};
    thresholdInput.value = 'not-a-number';
    thresholdInput.dispatchEvent(new Event('input', { bubbles: true }));
    thresholdInput.value = '0.64';
    thresholdInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uploadNav = document.getElementById('gm-nav-upload');
    uploadNav.click();
    expect(document.getElementById('gm-toast').classList.contains('show')).toBe(true);
    state.gstmxxEvents.dispatchEvent(new CustomEvent('uploadQueueChanged', { detail: { count: 3 } }));
    expect(uploadNav.getAttribute('aria-disabled')).toBe('false');
    expect(document.getElementById('gm-upload-badge').hidden).toBe(false);
    uploadNav.click();
    document.querySelector('.navbtn[data-screen="faces"]').click();
    expect(document.getElementById('historyDrawer').classList.contains('hidden')).toBe(false);
    document.querySelector('.navbtn[data-screen="faces"]').click();
    const dispatchEvent = state.gstmxxEvents.dispatchEvent.bind(state.gstmxxEvents);
    state.gstmxxEvents.dispatchEvent = event => {
      if (event.type === 'dbChanged') throw new Error('bus not ready');
      return dispatchEvent(event);
    };
    document.querySelector('.navbtn[data-screen="faces"]').click();
    state.gstmxxEvents.dispatchEvent = dispatchEvent;
    document.querySelector('.navbtn[data-screen="settings"]').click();
    document.querySelector('[data-close-screen]').click();
    state.gstmxxEvents.dispatchEvent(new CustomEvent('uploadQueueChanged', { detail: null }));
    expect(uploadNav.getAttribute('aria-disabled')).toBe('true');
    document.getElementById('recordBtn').click();

    const container = document.getElementById('ghostylesContainer');
    fire(container, 'click');
    const orphanPin = document.createElement('button');
    orphanPin.className = 'pin-btn pin-btn--1';
    container.appendChild(orphanPin);
    orphanPin.click();
    brush.pin1.click();
    expect(document.getElementById('gm-slot1').disabled).toBe(false);
    document.getElementById('gm-slot1').click();
    expect(brush.engine.classList.contains('active')).toBe(true);
    state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));
    expect(document.getElementById('gm-pluginbar').classList.contains('show')).toBe(true);
    brush.pin2.click();
    expect(document.getElementById('gm-slot1').disabled).toBe(true);
    document.getElementById('gm-slot2').click();
    document.getElementById('gm-pluginbar-close').click();
    ghost.pin1.click();
    expect(document.getElementById('gm-slot1').title).toBe('Another Style');
    document.getElementById('gm-slot1').click();
    document.getElementById('plugin3dParamsPanel').innerHTML = '<div class="pp-row"></div>';
    ghost.engine.classList.add('active');
    state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));
    expect(document.getElementById('gm-pluginbar').classList.contains('show')).toBe(true);
    ghost.engine.classList.remove('active');
    state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));
    expect(document.getElementById('gm-pluginbar').classList.contains('show')).toBe(false);
    stripes.pin1.click();
    stripes.pin2.click();
    document.getElementById('gm-slot1').click();
    document.getElementById('gm-slot2').click();
    state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));

    match(null);
    expect(document.getElementById('gm-state').textContent).toBe('measuring_status');
    document.getElementById('dbCount').textContent = '0';
    match({ faceapi: { liveMinDist: 0.1 } });
    expect(document.getElementById('gm-state').textContent).toBe('save_your_face_status');
    document.getElementById('dbCount').textContent = '2';
    document.getElementById('thresholdLabel').textContent = 'bad';
    match({ faceapi: { detectionState: 'eluded', obfMinDist: null, matchedId: 11 }, ghostylePresent: true });
    expect(document.getElementById('gm-state').textContent).toContain('no_face_found_status');
    match({ faceapi: { detectionState: 'eluded', obfMinDist: 0.8, obfMinId: 8 }, ghostylePresent: true });
    expect(document.getElementById('gm-num').textContent).toBe('0.80');
    match({ faceapi: { detectionState: 'matched', obfMinDist: 0.3, matchedId: 9 }, ghostylePresent: true });
    expect(document.getElementById('gm-state').textContent).toContain('recognised_status');
    match({ faceapi: { obfMinDist: 0.7, obfMinId: 6 }, ghostylePresent: true });
    expect(document.getElementById('gm-state').textContent).toContain('escaped_status');
    match({ faceapi: { obfMinDist: 0.2 }, ghostylePresent: true });
    expect(document.getElementById('gm-state').textContent).toContain('recognised_status');
    match({ faceapi: {}, ghostylePresent: true });
    expect(document.getElementById('readout').classList.contains('no-face')).toBe(true);
    match({ faceapi: { liveMinDist: null, distance: null } });
    expect(document.getElementById('gm-state').textContent).toBe('no_face_in_frame_status');
    match({ faceapi: { liveMinDist: 0.2, liveMinId: 2 } });
    expect(document.getElementById('gm-state').textContent).toContain('recognised_status');
    match({ faceapi: { distance: 0.9, matchedId: 3 } });
    expect(document.getElementById('gm-state').textContent).toContain('escaped_status');
    document.getElementById('thresholdLabel').textContent = '0.5';
    const dbCount = document.getElementById('dbCount');
    const thresholdLabel = document.getElementById('thresholdLabel');
    dbCount.remove(); thresholdLabel.remove();
    match({ faceapi: { liveMinDist: 0.2 } });
    document.body.append(dbCount, thresholdLabel);
    match(null);
    for (let i = 0; i < 45; i++) match({ faceapi: { liveMinDist: i / 100 } });
    expect(document.getElementById('gm-spark').innerHTML).toContain('<polyline');

    state.gstmxxEvents.dispatchEvent(new Event('i18n:localeChanged'));
    document.getElementById('closeSettingsBtn').click();
    document.getElementById('closeHistoryBtn').click();
    await vi.advanceTimersByTimeAsync(1600);
    await flushPromises();

    const viewer = document.getElementById('viewer');
    viewer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 240 });
    const zoom = (deltaY, x = 160, y = 120) => fire(viewer, 'wheel', { deltaY, clientX: x, clientY: y });
    zoom(-100);
    expect(viewer.style.transform).toContain('scale(');
    for (let i = 0; i < 30; i++) zoom(-100);
    for (let i = 0; i < 50; i++) zoom(100);
    fire(viewer, 'dblclick');
    expect(viewer.style.transform).toBe('');

    const pointer = (type, pointerId, clientX, clientY) => fire(viewer, type, { pointerId, clientX, clientY });
    pointer('pointermove', 99, 20, 20);
    pointer('pointerdown', 1, 20, 20);
    pointer('pointermove', 1, 25, 20);
    pointer('pointerdown', 2, 80, 20);
    pointer('pointermove', 2, 120, 20);
    expect(viewer.style.transform).toContain('scale(');
    pointer('pointermove', 2, 21, 20);
    pointer('pointerdown', 3, 140, 20);
    pointer('pointerup', 3, 140, 20);
    pointer('pointerup', 1, 20, 20);
    pointer('pointercancel', 2, 21, 20);

    await vi.advanceTimersByTimeAsync(1500);
    await flushPromises();
    expect(deps.initUploadConsentFlow).toHaveBeenCalled();
  });

  it('handles absent lab controls, missing bus, and empty pin fallback on delayed boot', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { state: isolatedState } = await import('../../lab-js/state.js');
    isolatedState.gstmxxEvents = null;
    window.gstmxx = null;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    document.body.innerHTML = `
      <button class="navbtn" data-screen="upload" aria-disabled="false"></button>
      <button class="navbtn" data-screen="disabled" aria-disabled="true"></button>
      <button class="navbtn" data-screen="faces" id="facesNav"></button>
      <section id="historyDrawer" class="hidden"></section>
      <button id="closeSettingsBtn"></button><button id="closeHistoryBtn"></button>
      <button data-close-screen></button>
      <button id="gm-slot1"></button><button id="gm-slot2"></button><button id="gm-pluginbar-close"></button>
      <div id="ghostylesContainer">
        <div class="ghostyle-row" data-effect="brush">
          <button class="pin-btn pin-btn--1"></button><button class="pin-btn pin-btn--2"></button>
          <button class="preview-btn active" data-effect="brush">Brush title</button>
        </div>
        <button class="preview-btn" data-effect="bare">Bare text</button>
      </div>`;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ghostyles: ['brush', 'missing'] }) })
      .mockRejectedValueOnce(new Error('offline')));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../../lab-js/lab-ui.js');
    window.dispatchEvent(new Event('gstmxxReady'));
    await flushPromises();

    document.querySelector('.navbtn').click();
    document.querySelector('.navbtn[data-screen="disabled"]').click();
    const facesNav = document.getElementById('facesNav');
    facesNav.remove();
    facesNav.click();
    document.getElementById('closeSettingsBtn').click();
    document.getElementById('closeHistoryBtn').click();
    document.querySelector('[data-close-screen]').click();
    document.getElementById('gm-slot2').click();
    const loadedEngine = document.querySelector('.preview-btn[data-effect="brush"]');
    loadedEngine.addEventListener('click', () => loadedEngine.classList.toggle('active'));
    document.querySelector('.pin-btn--1').click();
    document.querySelector('.pin-btn--1').click();
    expect(loadedEngine.classList.contains('active')).toBe(false);
    document.querySelector('.pin-btn--2').click();
    document.getElementById('gm-slot1').disabled = false;
    document.getElementById('gm-slot1').click();
    loadedEngine.classList.add('active');
    document.getElementById('gm-pluginbar-close').click();
    expect(loadedEngine.classList.contains('active')).toBe(false);
    window.dispatchEvent(new Event('i18n:localeChanged'));
    expect(warning).toHaveBeenCalledWith('console_lab_ui_bus_missing');

    await vi.advanceTimersByTimeAsync(1500);
    await flushPromises();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('uses empty-manifest fallback with a partial readout and reduced-motion recording', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { state: isolatedState } = await import('../../lab-js/state.js');
    isolatedState.gstmxxEvents = new EventTarget();
    window.gstmxx = {};
    document.body.innerHTML = `
      <div id="readout"><span id="gm-num">0.10</span><span id="gm-state"></span></div>
      <div id="dbCount">1</div><button id="recordBtn"></button><span id="gm-recdot"></span>
      <button id="copyMakeupBtn"></button><div id="gm-pluginbar"></div><div id="ghostylesContainer">
        <button class="preview-btn active" data-effect="brush">Fallback plugin</button>
      </div>`;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    await import('../../lab-js/lab-ui.js');
    await flushPromises();

    isolatedState.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', { detail: null }));
    isolatedState.gstmxxEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { faceapi: { liveMinDist: 0.42, liveMinId: 3 } },
    }));
    expect(document.getElementById('gm-num').textContent).toBe('0.42');
    expect(document.getElementById('gm-state').textContent).toContain('recognised_status');
    document.querySelector('.preview-btn').classList.remove('active');
    isolatedState.gstmxxEvents.dispatchEvent(new Event('effectChanged'));

    document.getElementById('recordBtn').click();
    expect(document.getElementById('gm-recdot').classList.contains('on')).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById('gm-recdot').classList.contains('on')).toBe(false);

    const copy = document.getElementById('copyMakeupBtn');
    copy.disabled = true;
    await flushPromises();
    expect(copy.disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    await flushPromises();
    expect(fetch).toHaveBeenCalledOnce();
  });
});