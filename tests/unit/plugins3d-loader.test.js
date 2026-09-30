import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rendererMock = {
  ensureLoaded: vi.fn(() => Promise.resolve()),
  render: vi.fn(),
};
const createUvRendererMock = vi.fn(() => rendererMock);
const utilsMock = {
  setLog: vi.fn(),
  asErrorLabel: vi.fn((err) => err?.message || String(err)),
  syncMirror: vi.fn(),
  syncSize: vi.fn(),
};
const domMock = {
  clearActiveEffect: vi.fn(),
};

function ensurePluginDom() {
  document.querySelectorAll('#plugin3dParamsPanel').forEach((el) => el.remove());
  document.querySelectorAll('[data-effect]').forEach((el) => el.remove());
  const panel = document.createElement('div');
  panel.id = 'plugin3dParamsPanel';
  document.body.appendChild(panel);
}

async function freshModules() {
  vi.resetModules();
  vi.doMock('../../lab-js/ghostyle3d-uv-renderer.js', () => ({
    createUvRenderer: createUvRendererMock,
  }));
  vi.doMock('../../lab-js/utils.js', () => utilsMock);
  vi.doMock('../../lab-js/dom.js', () => ({
    ...domMock,
  }));
  vi.doMock('../../lab-js/i18n.js', () => ({
    t: vi.fn((key, values = {}) => {
      const messages = {
        plugins3d_not_initialized_error: '[plugins3d] initPlugins3dLoader() non chiamato',
        plugins3d_missing_dom_error: '[plugins3d] elementi DOM mancanti',
        params_heading: `Parametri ${values.name || ''}`.trim(),
        plugin_runtime_error_log: `Plugin ${values.id} ha lanciato: ${values.message} (${values.hook})`,
      };
      return messages[key] || key;
    }),
  }));
  const stateModule = await import('../../lab-js/state.js');
  const rendererModule = await import('../../lab-js/ghostyle3d-uv-renderer.js');
  const utilsModule = await import('../../lab-js/utils.js');
  const domModule = await import('../../lab-js/dom.js');
  const loader = await import('../../lab-js/plugins3d-loader.js');
  return {
    loader,
    state: stateModule.state,
    createUvRenderer: rendererModule.createUvRenderer,
    utils: utilsModule,
    dom: domModule,
  };
}

function resetState(state) {
  state.activeEffect = null;
  state.loadedGhostyles = new Map();
  state.gstmxxEvents = new EventTarget();
}

describe('plugins3d-loader', () => {
  let originalRequestAnimationFrame;
  let originalConsoleError;

  beforeEach(() => {
    vi.clearAllMocks();
    rendererMock.ensureLoaded.mockResolvedValue();
    rendererMock.render.mockImplementation(() => {});
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalConsoleError = console.error;
    window.requestAnimationFrame = vi.fn((cb) => {
      cb();
      return 1;
    });
    ensurePluginDom();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    console.error = originalConsoleError;
  });

  it('reports null by default and guards public controls before initialization', async () => {
    const { loader } = await freshModules();

    expect(loader.getActiveEffect3d()).toBeNull();
    expect(() => loader.activateEffect3d('some-effect')).toThrow('[plugins3d] initPlugins3dLoader() non chiamato');
    expect(() => loader.deactivateEffect3d()).toThrow('[plugins3d] initPlugins3dLoader() non chiamato');
    expect(() => loader.toggleEffect3d('some-effect')).toThrow('[plugins3d] initPlugins3dLoader() non chiamato');
    expect(() => loader.reloadPlugins3d()).toThrow('[plugins3d] initPlugins3dLoader() non chiamato');
  });

  it('throws when the required DOM nodes are missing', async () => {
    const { loader } = await freshModules();
    document.getElementById('plugin3dParamsPanel').remove();

    expect(() => loader.initPlugins3dLoader()).toThrow('[plugins3d] elementi DOM mancanti');
  });

  it('initializes the UV renderer and renders editable parameter controls for the active 3D plugin', async () => {
    const { loader, state, createUvRenderer } = await freshModules();
    resetState(state);

    state.activeEffect = 'uv-style';
    state.loadedGhostyles.set('uv-style', {
      id: 'uv-style',
      name: 'UV Style',
      module: {
        paintUV: vi.fn(),
        params: [
          { name: 'scale', label: 'Scale', type: 'range', min: 0, max: 2, step: 1, default: 1.7 },
          { name: 'enabled', type: 'bool', default: 1 },
          { name: 'mode', type: 'select', options: ['soft', 'hard'], default: 'hard' },
          { name: 'tint', type: 'color', default: '#0f8' },
          { name: 'rgb', type: 'color', default: [300, -2, 'bad'] },
          { name: 'hex-six', type: 'color', default: '#336699' },
          { name: 'bad-color', type: 'color', default: 'not-a-color' },
          { name: 'numeric-color', type: 'color', default: 42 },
          { name: 'invalid-select', type: 'select', options: null, default: 'fallback' },
          { name: 'invalid-range', type: 'range', min: 0, max: 2, default: 1.2 },
          { name: 'ignored', type: 'unknown', default: 'x' },
        ],
      },
    });

    const runtime = loader.initPlugins3dLoader({ baseUrl: '/lab' });
    const panel = document.getElementById('plugin3dParamsPanel');

    expect(createUvRenderer).toHaveBeenCalledWith(expect.objectContaining({
      uvPath: '/lab/data/face_canonical_uv.json',
      getFaceLandmarker: expect.any(Function),
      log: expect.any(Function),
    }));
    expect(rendererMock.ensureLoaded).toHaveBeenCalledTimes(1);
    expect(loader.getActiveEffect3d()).toBe('uv-style');
    expect(panel.classList.contains('visible')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.textContent).toContain('Parametri UV Style');
    expect(panel.querySelectorAll('.pp-row')).toHaveLength(10);
    expect(runtime.paramValues.get('uv-style')).toEqual({
      scale: 2,
      enabled: true,
      mode: 'hard',
      tint: [0, 255, 136],
      rgb: [255, 0, 0],
      'hex-six': [51, 102, 153],
      'bad-color': [0, 0, 0],
      'numeric-color': [0, 0, 0],
      'invalid-select': 'fallback',
      'invalid-range': 1.2,
      ignored: 'x',
    });

    const range = panel.querySelector('input[type="range"]');
    const checkbox = panel.querySelector('input[type="checkbox"]');
    const select = panel.querySelector('select');
    const color = panel.querySelector('input[type="color"]');
    const badColor = panel.querySelectorAll('input[type="color"]')[2];

    range.value = '0.4';
    range.dispatchEvent(new Event('input'));
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('input'));
    select.value = 'soft';
    select.dispatchEvent(new Event('input'));
    color.value = '#336699';
    color.dispatchEvent(new Event('input'));
    Object.defineProperty(range, 'value', { configurable: true, get: () => 'not-a-number' });
    range.dispatchEvent(new Event('input'));
    expect(runtime.paramValues.get('uv-style').scale).toBe(2);
    delete range.value;
    Object.defineProperty(badColor, 'value', { configurable: true, get: () => 'invalid-color' });
    badColor.dispatchEvent(new Event('input'));
    delete badColor.value;
    state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));
      runtime.paramValues.get('uv-style').tint = [1, 2];
      state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));
    expect(panel.querySelector('input[type="color"]').value).toBe('#000000');
    runtime.paramValues.get('uv-style').tint = [51, 102, 153];
    expect(runtime.paramValues.get('uv-style').scale).toBe(2);

    const rendererOptions = createUvRenderer.mock.calls[0][0];
    window.gstmxx = null;
    expect(rendererOptions.getFaceLandmarker()).toBeNull();
    window.gstmxx = { FaceLandmarker: { test: true } };
    expect(rendererOptions.getFaceLandmarker()).toEqual({ test: true });
    rendererOptions.log('uv renderer message');
    expect(runtime.renderer.ensureLoaded).toHaveBeenCalled();

    expect(runtime.paramValues.get('uv-style')).toMatchObject({
      scale: 2,
      enabled: false,
      mode: 'soft',
      tint: [51, 102, 153],
    });
  });

  it('activates, deactivates, toggles, and logs reload compatibility through the public API', async () => {
    const { loader, state, utils } = await freshModules();
    resetState(state);

    const clickSpy = vi.fn();
    const btn = document.createElement('button');
    btn.dataset.effect = 'uv-style';
    btn.click = clickSpy;
    document.body.appendChild(btn);

    state.loadedGhostyles.set('uv-style', {
      id: 'uv-style',
      name: 'UV Style',
      module: { paintUV: vi.fn() },
    });
    state.loadedGhostyles.set('flat-style', {
      id: 'flat-style',
      name: 'Flat Style',
      module: {},
    });

    loader.initPlugins3dLoader();
    expect(loader.initPlugins3dLoader()).toBe(loader.initPlugins3dLoader());
    expect(loader.deactivateEffect3d()).toBe(false);

    expect(loader.activateEffect3d('flat-style')).toBe(false);
    expect(loader.activateEffect3d('missing')).toBe(false);
    state.loadedGhostyles.set('without-button', { id: 'without-button', module: { paintUV: vi.fn() } });
    expect(loader.activateEffect3d('without-button')).toBe(false);
    state.loadedGhostyles.set('non-button', { id: 'non-button', module: { paintUV: vi.fn() } });
    const querySelector = vi.spyOn(document, 'querySelector').mockReturnValue({});
    expect(loader.activateEffect3d('non-button')).toBe(false);
    querySelector.mockRestore();
    expect(loader.deactivateEffect3d()).toBe(false);
    expect(loader.activateEffect3d('uv-style')).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    state.activeEffect = 'uv-style';
    state.gstmxxEvents.dispatchEvent(new CustomEvent('effectChanged'));

    expect(loader.toggleEffect3d('uv-style')).toBe(true);
    expect(loader.deactivateEffect3d()).toBe(true);
    clickSpy.mockClear();
    state.activeEffect = null;
    state.gstmxxEvents.dispatchEvent(new CustomEvent('effectChanged'));
    expect(loader.toggleEffect3d('uv-style')).toBe(true);
    expect(clickSpy).toHaveBeenCalledOnce();
    state.activeEffect = 'uv-style';
    state.gstmxxEvents.dispatchEvent(new CustomEvent('effectChanged'));
    btn.remove();
    expect(loader.deactivateEffect3d()).toBe(false);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(loader.reloadPlugins3d()).toBe(false);
    expect(utils.setLog).toHaveBeenCalledWith(
      'reloadPlugins3d non disponibile: i plugin sono gestiti da ghostyles-manager.',
      'plugins3d'
    );
  });

  it('composites and renders the active 3D canvas on runtime events', async () => {
    const { loader, state, utils } = await freshModules();
    resetState(state);

    const module = { paintUV: vi.fn(), params: [{ name: 'strength', type: 'range', default: 0.5 }] };
    state.activeEffect = 'uv-style';
    state.loadedGhostyles.set('uv-style', {
      id: 'uv-style',
      name: 'UV Style',
      module,
    });

    const runtime = loader.initPlugins3dLoader();
    const compositeCtx = { drawImage: vi.fn() };
    const compositeCanvas = { width: 320, height: 240 };
    const landmarks = [{ x: 0.1, y: 0.2 }];

    state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite', {
      detail: { canvas: compositeCanvas, ctx: compositeCtx },
    }));
    state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite3d', {
      detail: { canvas: compositeCanvas, ctx: compositeCtx },
    }));
    state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite', { detail: {} }));
    state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite3d', { detail: { canvas: compositeCanvas } }));
    state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite', { detail: null }));
    state.gstmxxEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite3d', { detail: null }));
    state.gstmxxEvents.dispatchEvent(new CustomEvent('landmarks3d', {
      detail: { landmarks },
    }));

    expect(compositeCtx.drawImage).toHaveBeenCalledTimes(2);
    expect(utils.syncSize).toHaveBeenCalledWith(runtime.canvas, runtime.overlayEl);
    expect(utils.syncMirror).toHaveBeenCalledWith(runtime.canvas, runtime.overlayEl);
    expect(runtime.ctx.clearRect).toHaveBeenCalled();
    expect(runtime.ctx.save).toHaveBeenCalled();
    expect(rendererMock.render).toHaveBeenCalledWith(module, runtime.ctx, landmarks, { strength: 0.5 });
    expect(runtime.ctx.restore).toHaveBeenCalled();

    state.activeEffect = 'flat-style';
    state.loadedGhostyles.set('flat-style', { id: 'flat-style', name: 'Flat', module: {} });
    state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));
    state.gstmxxEvents.dispatchEvent(new CustomEvent('landmarks3d', { detail: { landmarks: [] } }));
    state.activeEffect = 'uv-style';
    state.gstmxxEvents.dispatchEvent(new Event('effectChanged'));
    state.loadedGhostyles.delete('uv-style');
    state.gstmxxEvents.dispatchEvent(new CustomEvent('landmarks3d', { detail: { landmarks: [{}] } }));
  });

  it('clears the active 3D plugin and broadcasts changes when renderer.render throws', async () => {
    const { loader, state, dom, utils } = await freshModules();
    resetState(state);
    console.error = vi.fn();
    rendererMock.render.mockImplementation(() => {
      throw new Error('paint failed');
    });

    const btn = document.createElement('button');
    btn.dataset.effect = 'uv-style';
    btn.classList.add('active');
    document.body.appendChild(btn);

    state.activeEffect = 'uv-style';
    state.loadedGhostyles.set('uv-style', {
      id: 'uv-style',
      name: 'UV Style',
      module: { paintUV: vi.fn() },
    });
    dom.clearActiveEffect.mockImplementation(() => {
      state.activeEffect = null;
    });

    const seen = [];
    state.gstmxxEvents.addEventListener('effectChanged', (event) => seen.push(['effectChanged', event.detail]));

    loader.initPlugins3dLoader();
    state.gstmxxEvents.dispatchEvent(new CustomEvent('landmarks3d', {
      detail: { landmarks: [{ x: 0.1, y: 0.2 }] },
    }));

    expect(utils.setLog).toHaveBeenCalledWith('Plugin uv-style ha lanciato: paint failed (paintUV)', 'uv-style');
    expect(console.error).toHaveBeenCalledWith('[plugins3d] paintUV errore in UV Style:', expect.any(Error));
    expect(btn.classList.contains('active')).toBe(false);
    expect(dom.clearActiveEffect).toHaveBeenCalled();
    expect(loader.getActiveEffect3d()).toBeNull();
    expect(seen).toContainEqual(['effectChanged', { activeEffect: null, previous: 'uv-style' }]);
  });
});
