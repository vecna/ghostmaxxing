import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../lab-js/state.js';
import { els } from '../../lab-js/dom.js';
import { setLog } from '../../lab-js/utils.js';
import {
  buildHeaderText,
  canShareFile,
  canUseClipboard,
  collectExportInput,
  exportMakeup,
  makeImageFile,
} from '../../lab-js/export-makeup.js';

vi.mock('../../lab-js/utils.js', async () => {
  const actual = await vi.importActual('../../lab-js/utils.js');
  return {
    ...actual,
    setLog: vi.fn(),
  };
});

vi.mock('../../lab-js/i18n.js', () => ({
  t: vi.fn((key) => {
    const messages = {
      image_copied_log: 'Immagine copiata negli appunti.',
      image_shared_log: 'Immagine condivisa.',
      image_copy_unavailable_log: 'Copia immagine non disponibile.',
      image_copy_error_log: 'Errore copia immagine.',
      console_clipboard_fallback: 'Clipboard non disponibile, provo share.',
      console_share_failed: 'Share fallita.',
      canvas_2d_context_error: 'Canvas 2D non disponibile.',
    };
    return messages[key] || key;
  }),
}));

function makeCanvas(width = 40, height = 30) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.toBlob = vi.fn((cb) => cb(new Blob(['png'], { type: 'image/png' })));
  return canvas;
}

function setNavigatorApi(values) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: values.clipboard,
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: values.share,
  });
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    writable: true,
    value: values.canShare,
  });
}

describe('export-makeup helpers', () => {
  let originalClipboardItem;
  let originalNavigatorClipboard;
  let originalNavigatorShare;
  let originalNavigatorCanShare;
  let originalConsoleError;

  beforeEach(() => {
    vi.clearAllMocks();
    originalClipboardItem = window.ClipboardItem;
    originalNavigatorClipboard = navigator.clipboard;
    originalNavigatorShare = navigator.share;
    originalNavigatorCanShare = navigator.canShare;
    originalConsoleError = console.error;
    console.error = vi.fn();

    state.lastCompositedCanvas = null;
    state.isMirrored = false;
    state.activeEffect = null;
    state.loadedGhostyles = new Map();
    state.lastKnownEffectResult = null;
    els.logBox.innerHTML = '';
  });

  afterEach(() => {
    window.ClipboardItem = originalClipboardItem;
    setNavigatorApi({
      clipboard: originalNavigatorClipboard,
      share: originalNavigatorShare,
      canShare: originalNavigatorCanShare,
    });
    console.error = originalConsoleError;
  });

  describe('buildHeaderText', () => {
    it('creates header text with plugin name', () => {
      const text = buildHeaderText('MyPlugin');
      expect(text).toContain('MyPlugin');
      expect(text).toContain('github.com/vecna/ghostmaxxing');
    });
  });

  describe('collectExportInput', () => {
    it('gathers correct information from appState and domEls', () => {
      const appState = {
        lastCompositedCanvas: 'fake-canvas',
        isMirrored: true,
        activeEffect: 'effect-id',
        loadedGhostyles: {
          get: (id) => ({ name: 'Ghostyle ' + id }),
        },
      };

      const domEls = {
        logBox: {
          lastChild: { textContent: 'Latest log message' },
        },
      };

      const input = collectExportInput(appState, domEls);
      expect(input.sourceCanvas).toBe('fake-canvas');
      expect(input.isMirrored).toBe(true);
      expect(input.pluginName).toBe('Ghostyle effect-id');
      expect(input.logText).toBe('Latest log message');
    });

    it('builds a live composite when no cached composited canvas exists', () => {
      const overlay = makeCanvas(80, 60);
      const mesh = document.getElementById('mesh3dOverlay');
      const bbox = document.getElementById('bboxOverlay');
      const video = document.createElement('video');
      const logLine = document.createElement('div');
      const compositeCtx = {
        drawImage: vi.fn(),
      };
      const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(compositeCtx);

      mesh.width = 80;
      mesh.height = 60;
      bbox.width = 80;
      bbox.height = 60;
      Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
      logLine.textContent = 'Live log';

      const input = collectExportInput({
        lastCompositedCanvas: null,
        isMirrored: false,
        activeEffect: 'missing',
        loadedGhostyles: new Map(),
      }, {
        overlay,
        video,
        logBox: { lastChild: logLine },
      });

      expect(input.sourceCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(input.sourceCanvas.width).toBe(80);
      expect(input.sourceCanvas.height).toBe(60);
      expect(input.pluginName).toBe('Nessun Ghostyle');
      expect(input.logText).toBe('Live log');
      expect(compositeCtx.drawImage).toHaveBeenCalled();

      getContextSpy.mockRestore();
    });

    it('returns null source when the overlay cannot provide dimensions', () => {
      const input = collectExportInput({
        lastCompositedCanvas: null,
        isMirrored: false,
        activeEffect: null,
        loadedGhostyles: new Map(),
      }, {
        overlay: { width: 0, height: 0 },
        logBox: {},
      });

      expect(input.sourceCanvas).toBeNull();
      expect(input.logText).toBe('');
    });
  });

  describe('makeImageFile', () => {
    it('creates a File object with correct filename and mime type', () => {
      const blob = new Blob([''], { type: 'image/png' });
      const copy = { filename: 'test.png', mimeType: 'image/png' };
      const file = makeImageFile(blob, copy);
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('test.png');
      expect(file.type).toBe('image/png');
    });
  });

  describe('browser support helpers', () => {
    it('detects clipboard image support', () => {
      window.ClipboardItem = vi.fn();
      expect(canUseClipboard({ clipboard: { write: vi.fn() } })).toBe(true);
      expect(canUseClipboard({ clipboard: {} })).toBe(false);
      expect(canUseClipboard({})).toBe(false);
    });

    it('detects Web Share file support with and without canShare', () => {
      const file = new File([], 'test.png');
      setNavigatorApi({ clipboard: undefined, share: undefined, canShare: undefined });
      expect(canShareFile(file)).toBe(false);

      setNavigatorApi({ clipboard: undefined, share: vi.fn(), canShare: undefined });
      expect(canShareFile(file)).toBe(true);

      const canShare = vi.fn(() => false);
      setNavigatorApi({ clipboard: undefined, share: vi.fn(), canShare });
      expect(canShareFile(file)).toBe(false);
      expect(canShare).toHaveBeenCalledWith({ files: [file] });
    });
  });

  describe('exportMakeup workflow', () => {
    it('renders and copies the current composited canvas to the clipboard', async () => {
      const source = makeCanvas(64, 48);
      const clipboardWrite = vi.fn(() => Promise.resolve());
      const clipboardItemSpy = vi.fn(function ClipboardItem(items) {
        this.items = items;
      });
      const ctx = document.createElement('canvas').getContext('2d');
      const fillTextSpy = vi.spyOn(ctx, 'fillText');
      const drawSpy = vi.spyOn(ctx, 'drawImage');

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
      window.ClipboardItem = clipboardItemSpy;
      setNavigatorApi({
        clipboard: { write: clipboardWrite },
        share: undefined,
        canShare: undefined,
      });

      state.lastCompositedCanvas = source;
      state.isMirrored = true;
      state.activeEffect = 'ghost';
      state.loadedGhostyles.set('ghost', { name: 'Ghost Export' });
      state.lastKnownEffectResult = { detection: { score: 0.8 } };
      els.logBox.appendChild(Object.assign(document.createElement('div'), { textContent: 'Matched face' }));

      await exportMakeup();

      expect(source.toBlob).not.toHaveBeenCalled();
      expect(clipboardItemSpy).toHaveBeenCalledWith(expect.objectContaining({ 'image/png': expect.any(Blob) }));
      expect(clipboardWrite).toHaveBeenCalledWith([expect.any(clipboardItemSpy)]);
      expect(drawSpy).toHaveBeenCalledWith(source, 0, 44);
      expect(fillTextSpy).toHaveBeenCalledWith(expect.stringContaining('Ghost Export'), 32, 22);
      expect(fillTextSpy).toHaveBeenCalledWith('Matched face', 32, 117);
      expect(setLog).toHaveBeenCalledWith('Immagine copiata negli appunti.');
      expect(navigator.share).toBeUndefined();

      HTMLCanvasElement.prototype.getContext.mockRestore();
    });

    it('falls back to Web Share when clipboard write fails', async () => {
      const clipboardWrite = vi.fn(() => Promise.reject(new Error('clipboard denied')));
      const share = vi.fn(() => Promise.resolve());
      window.ClipboardItem = vi.fn(function ClipboardItem(items) {
        this.items = items;
      });
      setNavigatorApi({
        clipboard: { write: clipboardWrite },
        share,
        canShare: vi.fn(() => true),
      });
      state.lastCompositedCanvas = makeCanvas(20, 20);

      await exportMakeup();

      expect(console.error).toHaveBeenCalledWith('Clipboard non disponibile, provo share.', expect.any(Error));
      expect(share).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Ghostmaxxing Makeup',
        text: 'Learn some adversarial makeup techniques!',
        files: [expect.any(File)],
      }));
      expect(setLog).toHaveBeenCalledWith('Immagine condivisa.');
    });

    it('logs unavailable delivery when clipboard and share both fail', async () => {
      window.ClipboardItem = undefined;
      setNavigatorApi({
        clipboard: undefined,
        share: undefined,
        canShare: undefined,
      });
      state.lastCompositedCanvas = makeCanvas(20, 20);

      await exportMakeup();

      expect(console.error).toHaveBeenCalledWith('Clipboard non disponibile, provo share.', expect.any(Error));
      expect(console.error).toHaveBeenCalledWith('Share fallita.', expect.any(Error));
      expect(setLog).toHaveBeenCalledWith('Copia immagine non disponibile.');
    });

    it('logs a render/export error when canvas blob generation fails', async () => {
      const source = makeCanvas(20, 20);
      const originalCreateElement = document.createElement.bind(document);
      document.createElement = vi.fn((tagName, ...args) => {
        const el = originalCreateElement(tagName, ...args);
        if (tagName === 'canvas') {
          el.toBlob = vi.fn((cb) => cb(null));
        }
        return el;
      });
      state.lastCompositedCanvas = source;

      await exportMakeup();

      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
      expect(setLog).toHaveBeenCalledWith('Errore copia immagine.');

      document.createElement = originalCreateElement;
    });

    it('returns early when there is no source canvas to export', async () => {
      state.lastCompositedCanvas = null;
      els.overlay.width = 0;
      els.overlay.height = 0;

      await exportMakeup();

      expect(setLog).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});
