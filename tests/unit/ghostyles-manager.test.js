import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../lab-js/dom.js', () => ({
  els: {
    overlay: {
      getContext: vi.fn(() => ({
        clearRect: vi.fn()
      }))
    },
    ghostylesContainer: { appendChild: vi.fn() }
  },
  clearActiveEffect: vi.fn(),
  effectSelected: vi.fn()
}));

vi.mock('../../lab-js/utils.js', () => ({
  asErrorLabel: vi.fn((err) => (err instanceof Error ? err.name + ': ' + err.message : String(err))),
  setLog: vi.fn(),
  formatRelativeTime: vi.fn((dateLike) => {
    if (!dateLike) return 'n/d';
    return '3 giorni fa';
  })
}));

vi.mock('https://example.com/effects/graphic-liner.js', () => ({
  onClear: 'mock-on-clear'
}), { virtual: true });

vi.mock('https://example.com/effects/init-effect.js', () => ({
  onInit: vi.fn(() => 'init ok'),
  onClear: vi.fn(),
  onDraw: vi.fn()
}), { virtual: true });

vi.mock('https://example.com/effects/init-fail.js', () => ({
  onInit: vi.fn(() => { throw new Error('init boom'); }),
  onDraw: vi.fn()
}), { virtual: true });

vi.mock('https://example.com/effects/missing-callbacks.js', () => ({
  SOME_CONST: 123
}), { virtual: true });

vi.mock('https://example.com/effects/draw-fail.js', () => ({
  onDraw: vi.fn(() => { throw new TypeError('draw boom'); })
}), { virtual: true });

vi.mock('https://example.com/effects/clear-fail.js', () => ({
  onDraw: vi.fn(),
  onClear: vi.fn(() => { throw 'clear boom'; }),
}), { virtual: true });

vi.mock('https://example.com/effects/paint-fail.js', () => ({
  paintUV: vi.fn(() => { throw new Error('paint boom'); }),
}), { virtual: true });

vi.mock('https://example.com/effects/init-effect.js?t=123', () => ({
  onInit: vi.fn(() => 'reload init'),
  onDraw: vi.fn(),
}), { virtual: true });

vi.mock('https://example.com/effects/missing-callbacks.js?t=123', () => ({ SOME_CONST: true }), { virtual: true });

import { state } from '../../lab-js/state.js';
import { setLog, formatRelativeTime } from '../../lab-js/utils.js';
import { clearActiveEffect, effectSelected, els } from '../../lab-js/dom.js';
import { fetchGhostyleMetadata, importGhostyleModule, loadGhostyle, toggleEffect, reloadPlugins } from '../../lab-js/ghostyles-manager.js';

describe('ghostyles-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.activeEffect = null;
    state.loadedGhostyles = new Map();
    state.gstmxxEvents = new EventTarget();
    els.ghostylesContainer.appendChild.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchGhostyleMetadata', () => {
    it('successfully fetches and extracts metadata', async () => {
      const mockText = `
        // @name Eye Liner Style
        // @version 1.0.0
        // @release_date 2026-01-20
        export default function() {}
      `;
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => mockText
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const meta = await fetchGhostyleMetadata('https://example.com/effects/graphic-liner.js');
      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/effects/graphic-liner.js', { cache: 'no-store' });
      expect(meta).toMatchObject({
        id: 'graphic-liner',
        name: 'Eye Liner Style',
        url: 'https://example.com/effects/graphic-liner.js',
        version: '1.0.0',
        releaseDate: '2026-01-20',
        hasName: true,
        hasVersion: true,
        hasReleaseDate: true
      });
    });

    it('extracts optional author and description metadata', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => '// @name Full Metadata\n// @author Ada\n// @description A short style\n// @version 2.0',
      });
      await expect(fetchGhostyleMetadata('https://example.com/effects/full.js')).resolves.toMatchObject({
        author: 'Ada', description: 'A short style', version: '2.0',
      });
    });

    it('uses id as name if @name metadata is missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'export default function() {}'
      });

      const meta = await fetchGhostyleMetadata('https://example.com/effects/mystyle.js?t=123');
      expect(meta).toMatchObject({
        id: 'mystyle',
        name: 'mystyle',
        url: 'https://example.com/effects/mystyle.js?t=123',
        version: null,
        author: null,
        description: null,
        releaseDate: null,
        hasName: false,
        hasVersion: false,
        hasReleaseDate: false
      });
    });

    it('handles URLs ending in a slash and missing expected names', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: async () => 'export default {}' });
      await expect(fetchGhostyleMetadata('https://example.com/effects/')).resolves.toMatchObject({ id: '', name: '' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 });
      await expect(loadGhostyle('https://example.com/effects/broken.js', null)).rejects.toThrow('https://example.com/effects/broken.js');
    });

    it('throws error when response is not ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 });

      await expect(fetchGhostyleMetadata('https://example.com/effects/notfound.js'))
        .rejects.toThrow('HTTP 404');
    });
  });

  describe('importGhostyleModule', () => {
    it('dynamically imports the module url', async () => {
      const meta = { id: 'graphic-liner', name: 'Eye Liner Style', url: 'https://example.com/effects/graphic-liner.js' };
      const res = await importGhostyleModule(meta);
      expect(res.id).toBe('graphic-liner');
      expect(res.name).toBe('Eye Liner Style');
      expect(res.module.onClear).toBe('mock-on-clear');
    });
  });

  describe('loadGhostyle', () => {
    it('loads a ghostyle, runs onInit, appends a button and wires toggle callback', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Init Effect\n// @version 1.0.0\n// @release_date 2026-06-01'
      });
      const onFaceapiToggle = vi.fn();

      const ghostyle = await loadGhostyle('https://example.com/effects/init-effect.js', null, { onFaceapiToggle });

      expect(ghostyle).toMatchObject({
        id: 'init-effect',
        name: 'Init Effect',
        url: 'https://example.com/effects/init-effect.js',
        releaseDate: '2026-06-01',
        freshnessLabel: '3 giorni fa'
      });
      expect(state.loadedGhostyles.get('init-effect')).toBe(ghostyle);
      expect(els.ghostylesContainer.appendChild).toHaveBeenCalledTimes(1);

      const button = els.ghostylesContainer.appendChild.mock.calls[0][0];
      expect(button.className).toBe('preview-btn');
      expect(button.textContent).toContain('Init Effect');
      expect(button.querySelector('.preview-btn__title')?.textContent).toBe('Init Effect');
      expect(button.querySelector('.preview-btn__meta')?.textContent).toBe('aggiornato 3 giorni fa');
      expect(button.dataset.effect).toBe('init-effect');

      expect(setLog).toHaveBeenCalledWith('Init Effect: init ok');
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Caricato con successo ghostyle Init Effect'));

      button.onclick();
      expect(state.activeEffect).toBe('init-effect');
      expect(onFaceapiToggle).toHaveBeenCalledTimes(1);
    });

    it('inserts the preview button into a real ghostyle row', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, status: 200,
        text: async () => '// @name Real Row\n// @version 1.0\n// @release_date 2026-05-01',
      });
      const originalContainer = els.ghostylesContainer;
      els.ghostylesContainer = document.createElement('div');
      await loadGhostyle('https://example.com/effects/init-effect.js', 'Real Row');
      expect(els.ghostylesContainer.querySelector('.ghostyle-row .preview-btn')).not.toBeNull();
      expect(els.ghostylesContainer.querySelector('.ghostyle-row .ghostyle-pins')).not.toBeNull();
      els.ghostylesContainer = originalContainer;
    });

    it('ignores a plugin without onDraw and paintUV', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name No Callbacks\n// @version 1.0.0\n// @release_date 2026-01-01'
      });

      const ghostyle = await loadGhostyle('https://example.com/effects/missing-callbacks.js', 'No Callbacks');
      expect(ghostyle).toBeNull();
      expect(els.ghostylesContainer.appendChild).not.toHaveBeenCalled();
      expect(setLog).toHaveBeenCalledWith('Plugin missing-callbacks non esporta ne onDraw ne paintUV, ignorato', 'loader');
    });

    it('uses fallback id when @name is missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @version 1.0.0\n// @release_date 2026-05-01'
      });

      const ghostyle = await loadGhostyle('https://example.com/effects/init-effect.js', 'Manifest Name');
      expect(ghostyle.name).toBe('init-effect');
      expect(setLog).toHaveBeenCalledWith('Plugin init-effect senza @name nell\'header, uso fallback init-effect', 'loader');
    });

    it('logs warning when @version is missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Missing Version\n// @release_date 2026-05-01'
      });

      const ghostyle = await loadGhostyle('https://example.com/effects/init-effect.js', null);
      expect(ghostyle).not.toBeNull();
      expect(setLog).toHaveBeenCalledWith('Plugin init-effect senza @version', 'loader');
    });

    it('uses the fallback freshness text when the relative label is empty', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, status: 200,
        text: async () => '// @name Empty Freshness\n// @version 1.0\n// @release_date 2026-05-01',
      });
      formatRelativeTime.mockReturnValueOnce('');
      const ghostyle = await loadGhostyle('https://example.com/effects/init-effect.js', null);
      expect(ghostyle.freshnessLabel).toBe('');
      const button = els.ghostylesContainer.appendChild.mock.calls.at(-1)[0];
      expect(button.querySelector('.preview-btn__meta').textContent).toBe('aggiornato n/d');
    });

    it('logs warning when @release_date is invalid and keeps loading', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Invalid Date\n// @version 1.0.0\n// @release_date not-a-date'
      });

      const ghostyle = await loadGhostyle('https://example.com/effects/init-effect.js', null);
      expect(ghostyle.releaseDate).toBeNull();
      expect(setLog).toHaveBeenCalledWith(
        'Plugin init-effect ha @release_date non valida (not-a-date), ignorata',
        'loader'
      );
    });

    it('uses HEAD freshness fallback for invalid and valid release headers', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
        if (options?.method === 'HEAD') {
          const call = fetchSpy.mock.calls.filter(([, opts]) => opts?.method === 'HEAD').length;
          if (call === 1) return { ok: false, headers: { get: vi.fn() } };
          if (call === 2) return { ok: true, headers: { get: () => null } };
          if (call === 3) return { ok: true, headers: { get: () => 'not-a-date' } };
          return { ok: true, headers: { get: () => '2026-06-26T00:00:00.000Z' } };
        }
        return { ok: true, status: 200, text: async () => '// @name Init Effect\n// @version 1.0.0' };
      });
      const first = await loadGhostyle('https://example.com/effects/init-effect.js', null);
      const second = await loadGhostyle('https://example.com/effects/init-effect.js', null);
      const third = await loadGhostyle('https://example.com/effects/init-effect.js', null);
      const fourth = await loadGhostyle('https://example.com/effects/init-effect.js', null);
      expect([first.freshnessLabel, second.freshnessLabel, third.freshnessLabel, fourth.freshnessLabel])
        .toEqual(['n/d', 'n/d', 'n/d', '3 giorni fa']);
    });

    it('wraps onInit errors without rejecting load', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Init Fail\n// @version 1.0.0\n// @release_date 2025-01-01'
      });

      const ghostyle = await loadGhostyle('https://example.com/effects/init-fail.js', 'Init Fail');
      expect(ghostyle).not.toBeNull();
      expect(setLog).toHaveBeenCalledWith(
        expect.stringContaining('Plugin init-fail ha lanciato: Error: init boom (onInit)'),
        'init-fail'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('deactivates plugin when wrapped onDraw throws', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Draw Fail\n// @version 1.0.0\n// @release_date 2026-05-01'
      });

      const ghostyle = await loadGhostyle('https://example.com/effects/draw-fail.js', null);
      state.activeEffect = 'draw-fail';

      const onEffectChanged = vi.fn();
      state.gstmxxEvents.addEventListener('effectChanged', onEffectChanged);

      ghostyle.module.onDraw({}, {}, {});

      expect(clearActiveEffect).toHaveBeenCalledTimes(1);
      expect(onEffectChanged).toHaveBeenCalledTimes(1);
      expect(setLog).toHaveBeenCalledWith(
        expect.stringContaining('Plugin draw-fail ha lanciato: TypeError: draw boom (onDraw)'),
        'draw-fail'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('wraps onClear and paintUV exceptions and deactivates an active plugin button', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, status: 200,
        text: async () => '// @name Clear Fail\n// @version 1.0\n// @release_date 2026-05-01',
      });
      const clearPlugin = await loadGhostyle('https://example.com/effects/clear-fail.js', 'Clear Fail');
      state.activeEffect = 'clear-fail';
      const button = document.createElement('button');
      button.className = 'preview-btn active';
      button.dataset.effect = 'clear-fail';
      document.body.appendChild(button);
      clearPlugin.module.onClear({});
      expect(button.classList.contains('active')).toBe(false);
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('clear boom'), 'clear-fail');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, status: 200,
        text: async () => '// @name Paint Fail\n// @version 1.0\n// @release_date 2026-05-01',
      });
      const paintPlugin = await loadGhostyle('https://example.com/effects/paint-fail.js', 'Paint Fail');
      paintPlugin.module.paintUV({}, {}, {});
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('paint boom'), 'paint-fail');
    });

    it('wraps metadata fetch errors with requested plugin name', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 });

      await expect(loadGhostyle('https://example.com/effects/broken.js', 'Broken Style'))
        .rejects.toThrow('Errore metadata plugin (Broken Style): HTTP 500');
    });

    it('wraps dynamic import errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Missing Effect\n// @version 1.0.0\n// @release_date 2025-01-01'
      });

      await expect(loadGhostyle('https://example.com/effects/missing.js', 'Missing Effect'))
        .rejects.toThrow("Errore durante l'importazione del modulo:");
    });
  });

  describe('toggleEffect', () => {
    it('deactivates and clears current effect if called with active effect', () => {
      const onClearMock = vi.fn();
      const mockEffect = {
        id: 'graphic-liner',
        name: 'Eye Liner Style',
        module: { onClear: onClearMock }
      };
      state.activeEffect = 'graphic-liner';
      state.loadedGhostyles.set('graphic-liner', mockEffect);

      const eventListener = vi.fn();
      state.gstmxxEvents.addEventListener('effectChanged', eventListener);

      toggleEffect('graphic-liner', null);

      expect(onClearMock).toHaveBeenCalled();
      expect(clearActiveEffect).toHaveBeenCalled();
      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(eventListener.mock.calls[0][0].detail).toEqual({
        activeEffect: null,
        previous: 'graphic-liner'
      });
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Disattivazione in corso'));
    });

    it('activates a new effect and dispatches effectChanged', () => {
      const mockEffect = {
        id: 'graphic-liner',
        name: 'Eye Liner Style',
        module: {}
      };
      state.loadedGhostyles.set('graphic-liner', mockEffect);

      const eventListener = vi.fn();
      state.gstmxxEvents.addEventListener('effectChanged', eventListener);

      const dummyButton = {};
      toggleEffect('graphic-liner', dummyButton);

      expect(state.activeEffect).toBe('graphic-liner');
      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(eventListener.mock.calls[0][0].detail).toEqual({
        activeEffect: 'graphic-liner',
        previous: null
      });
      expect(effectSelected).toHaveBeenCalledWith(dummyButton);
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('attivato'));
    });

    it('reports a throwing onClear hook while deactivating an active effect', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      state.activeEffect = 'bad-clear';
      state.loadedGhostyles.set('bad-clear', {
        module: { onClear: () => { throw new Error('clear failed'); } },
      });
      toggleEffect('bad-clear', null);
      expect(clearActiveEffect).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('[plugin:bad-clear] errore in onClear:', expect.any(Error));
    });

    it('switches away from a previous plugin without an onClear hook', () => {
      const previous = { id: 'previous', name: 'Previous', module: {} };
      const next = { id: 'next', name: 'Next', module: {} };
      state.activeEffect = 'previous';
      state.loadedGhostyles.set('previous', previous);
      state.loadedGhostyles.set('next', next);
      const eventListener = vi.fn();
      state.gstmxxEvents.addEventListener('effectChanged', eventListener);

      toggleEffect('next', {});
      expect(state.activeEffect).toBe('next');
      expect(clearActiveEffect).not.toHaveBeenCalled();
      expect(eventListener.mock.calls.at(-1)[0].detail).toEqual({ activeEffect: 'next', previous: 'previous' });
    });
  });

  describe('reloadPlugins', () => {
    it('clears active plugins, cache-busts a manifest URL, and returns loaded count', async () => {
      const onClear = vi.fn();
      state.activeEffect = 'previous';
      state.loadedGhostyles.set('previous', { id: 'previous', module: { onClear } });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => [] });
      const onEffectChanged = vi.fn();
      state.gstmxxEvents.addEventListener('effectChanged', onEffectChanged);
      const count = await reloadPlugins({ manifestUrl: 'https://example.com/manifest.json?rev=1' });
      expect(count).toBe(0);
      expect(onClear).toHaveBeenCalled();
      expect(clearActiveEffect).toHaveBeenCalled();
      expect(state.loadedGhostyles.size).toBe(0);
      expect(fetchSpy.mock.calls[0][0]).toMatch(/manifest\.json\?rev=1&t=\d+/);
      expect(onEffectChanged).toHaveBeenCalledWith(expect.objectContaining({ detail: { activeEffect: null, previous: 'previous' } }));
    });

    it('rejects an unsuccessful manifest response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 502 });
      await expect(reloadPlugins({ baseUrl: 'https://example.com/plugins' })).rejects.toThrow('HTTP 502');
    });

    it('loads renderable plugins from a cache-busted manifest and counts them', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(123));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.includes('manifest.json')) {
          return { ok: true, json: async () => [{ url: 'init-effect.js', id: 'init-effect' }] };
        }
        if (options?.method === 'HEAD') return { ok: true, headers: { get: () => '2026-06-26T00:00:00.000Z' } };
        return { ok: true, status: 200, text: async () => '// @name Init Effect\n// @version 1.0.0\n// @release_date 2026-06-26' };
      });
      const loaded = await reloadPlugins({
        baseUrl: 'https://example.com/effects',
        manifestUrl: 'https://example.com/manifest.json',
      });
      expect(loaded).toBe(1);
      expect(state.loadedGhostyles.has('init-effect')).toBe(true);
      expect(fetchSpy.mock.calls[0][0]).toContain('manifest.json?t=123');
      const button = els.ghostylesContainer.appendChild.mock.calls.at(-1)[0];
      button.onclick();
      expect(state.activeEffect).toBe('init-effect');
      vi.useRealTimers();
    });

    it('reloads one plugin and forwards its face-api toggle callback', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(123));
      const onFaceapiToggle = vi.fn();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        if (url.includes('manifest.json')) {
          return { ok: true, json: async () => [{ url: 'init-effect.js', id: 'init-effect' }] };
        }
        return { ok: true, status: 200, text: async () => '// @name Reloaded\n// @version 1.0\n// @release_date 2026-06-26' };
      });
      expect(await reloadPlugins({
        baseUrl: 'https://example.com/effects',
        manifestUrl: 'https://example.com/manifest.json',
        onFaceapiToggle,
      })).toBe(1);
      expect(fetchSpy).toHaveBeenCalled();
      const button = els.ghostylesContainer.appendChild.mock.calls.at(-1)[0];
      button.onclick();
      expect(onFaceapiToggle).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it('counts only renderable entries and tolerates a missing plugin container', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(123));
      vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        if (url.includes('manifest.json')) {
          return { ok: true, json: async () => [
            { url: 'init-effect.js', id: 'init-effect' },
            { url: 'missing-callbacks.js', name: 'Empty' },
          ] };
        }
        const noCallbacks = url.includes('missing-callbacks.js');
        return { ok: true, status: 200, text: async () => noCallbacks
          ? '// @name Empty\n// @version 1.0\n// @release_date 2026-06-26'
          : '// @name Init Effect\n// @version 1.0\n// @release_date 2026-06-26' };
      });
      const originalContainer = els.ghostylesContainer;
      els.ghostylesContainer = null;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, json: async () => [] }));
      const emptyCount = await reloadPlugins({
        baseUrl: 'https://example.com/effects',
        manifestUrl: 'https://example.com/manifest.json',
      });
      expect(emptyCount).toBe(0);
      els.ghostylesContainer = originalContainer;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        if (url.includes('manifest.json')) {
          return { ok: true, json: async () => [
            { url: 'init-effect.js', id: 'init-effect' },
            { url: 'missing-callbacks.js', name: 'Empty' },
          ] };
        }
        const noCallbacks = url.includes('missing-callbacks.js');
        return { ok: true, status: 200, text: async () => noCallbacks
          ? '// @name Empty\n// @version 1.0\n// @release_date 2026-06-26'
          : '// @name Init Effect\n// @version 1.0\n// @release_date 2026-06-26' };
      });
      const count = await reloadPlugins({
        baseUrl: 'https://example.com/effects',
        manifestUrl: 'https://example.com/manifest.json',
      });
      expect(count).toBe(1);
      vi.useRealTimers();
    });
  });
});
