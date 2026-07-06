import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../scripts/dom.js', () => ({
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

vi.mock('../../scripts/utils.js', () => ({
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

import { state } from '../../scripts/state.js';
import { setLog } from '../../scripts/utils.js';
import { clearActiveEffect, effectSelected, els } from '../../scripts/dom.js';
import { fetchGhostyleMetadata, importGhostyleModule, loadGhostyle, toggleEffect } from '../../scripts/ghostyles-manager.js';

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
  });
});
