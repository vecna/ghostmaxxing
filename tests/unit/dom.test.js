import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { state } from '../../lab-js/state.js';
import {
  els,
  setStatus,
  clearOverlay,
  clearActiveEffect,
  effectSelected
} from '../../lab-js/dom.js';

vi.mock('../../lab-js/i18n.js', () => ({
  t: vi.fn((key) => {
    const messages = {
      not_available_label: 'not_available_label',
      off_status: 'off_status',
      active_style_missing_console: 'active_style_missing_console'
    };
    return messages[key] || key;
  }),
}));

describe('dom.js functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Clear and restore DOM elements before each test
    els.statusDot.className = '';
    els.statusText.textContent = '';
    els.ghostylesContainer.innerHTML = '';
    els.scanBtn.style.background = '';
    els.scanBtn.style.borderColor = '';
    els.scanBtn.style.color = '';
    els.effectName.textContent = '';
    els.effectTracking.textContent = '';
    els.copyMakeupBtn.disabled = false;
    els.previewImage.style.display = 'block';
    els.previewImage.setAttribute('src', 'test.jpg');

    // Reset state
    state.activeEffect = 'some-effect';
    state.loadedGhostyles = new Map();
    state.lastKnownEffectResult = {};
    state.lastCompositedCanvas = {};
    state.overlayFadeTimeout = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setStatus', () => {
    it('sets status dot class and status text for live status', () => {
      setStatus('live', 'Webcam attiva');
      expect(els.statusDot.classList.contains('status-dot')).toBe(true);
      expect(els.statusDot.classList.contains('live')).toBe(true);
      expect(els.statusText.textContent).toBe('Webcam attiva');
    });

    it('sets status dot class and status text for error status', () => {
      setStatus('error', 'Errore fotocamera');
      expect(els.statusDot.classList.contains('status-dot')).toBe(true);
      expect(els.statusDot.classList.contains('error')).toBe(true);
      expect(els.statusText.textContent).toBe('Errore fotocamera');
    });
  });

  describe('clearOverlay', () => {
    it('clears canvas context and resets style/timeouts', () => {
      const mockCtx = {
        clearRect: vi.fn()
      };
      vi.spyOn(els.overlay, 'getContext').mockReturnValue(mockCtx);
      
      const dummyTimeout = setTimeout(() => {}, 1000);
      state.overlayFadeTimeout = dummyTimeout;

      clearOverlay();

      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, els.overlay.width, els.overlay.height);
      expect(els.overlay.style.transition).toBe('none');
      expect(els.overlay.style.opacity).toBe('1');
    });
  });

  describe('clearActiveEffect', () => {
    it('clears active effects and resets UI', () => {
      // Setup some preview buttons in the container
      const btn1 = document.createElement('button');
      btn1.className = 'preview-btn active';
      const btn2 = document.createElement('button');
      btn2.className = 'preview-btn active';
      els.ghostylesContainer.appendChild(btn1);
      els.ghostylesContainer.appendChild(btn2);

      // Set some initial styling on scanBtn
      els.scanBtn.style.background = 'red';
      els.scanBtn.style.borderColor = 'blue';
      els.scanBtn.style.color = 'green';

      // Set some initial text on labels
      els.effectName.textContent = 'Some Effect';
      els.effectTracking.textContent = 'some-effect';

      // Set initial states
      state.activeEffect = 'some-effect';
      state.lastKnownEffectResult = { foo: 'bar' };
      state.lastCompositedCanvas = {};
      els.copyMakeupBtn.disabled = false;

      // Mock canvas getContext
      const mockCtx = {
        clearRect: vi.fn()
      };
      vi.spyOn(els.overlay, 'getContext').mockReturnValue(mockCtx);

      clearActiveEffect();

      // Assertions
      expect(btn1.classList.contains('active')).toBe(false);
      expect(btn2.classList.contains('active')).toBe(false);
      
      expect(els.scanBtn.style.background).toBe('');
      expect(els.scanBtn.style.borderColor).toBe('');
      expect(els.scanBtn.style.color).toBe('');

      expect(els.effectName.textContent).toBe('not_available_label');
      expect(els.effectTracking.textContent).toBe('off_status');

      expect(state.activeEffect).toBeNull();
      expect(state.lastKnownEffectResult).toBeNull();
      expect(state.lastCompositedCanvas).toBeNull();
      expect(els.copyMakeupBtn.disabled).toBe(true);

      expect(mockCtx.clearRect).toHaveBeenCalled();
    });

    it('handles missing elements gracefully', () => {
      const originalContainer = els.ghostylesContainer;
      const originalScanBtn = els.scanBtn;
      const originalEffectName = els.effectName;
      const originalEffectTracking = els.effectTracking;
      const originalCopyMakeupBtn = els.copyMakeupBtn;

      els.ghostylesContainer = null;
      els.scanBtn = null;
      els.effectName = null;
      els.effectTracking = null;
      els.copyMakeupBtn = null;

      expect(() => clearActiveEffect()).not.toThrow();

      // Restore
      els.ghostylesContainer = originalContainer;
      els.scanBtn = originalScanBtn;
      els.effectName = originalEffectName;
      els.effectTracking = originalEffectTracking;
      els.copyMakeupBtn = originalCopyMakeupBtn;
    });
  });

  describe('effectSelected', () => {
    it('applies styling and labels when style exists in loadedGhostyles', () => {
      const btn1 = document.createElement('button');
      btn1.className = 'preview-btn';
      const btn2 = document.createElement('button');
      btn2.className = 'preview-btn';
      els.ghostylesContainer.appendChild(btn1);
      els.ghostylesContainer.appendChild(btn2);

      // Set activeEffect and loadedGhostyles
      state.activeEffect = 'my-style';
      state.loadedGhostyles.set('my-style', { name: 'My Style Name' });

      const dummyTimeout = setTimeout(() => {}, 1000);
      state.overlayFadeTimeout = dummyTimeout;

      effectSelected(btn1);

      expect(btn1.classList.contains('active')).toBe(true);
      expect(btn2.classList.contains('active')).toBe(false);

      expect(els.previewImage.style.display).toBe('none');
      expect(els.previewImage.getAttribute('src')).toBeNull();

      expect(els.scanBtn.style.color).toBe('rgb(255, 255, 255)');
      expect(els.scanBtn.style.borderColor).toBe('rgba(159, 122, 234, 0.5)');

      expect(els.overlay.style.transition).toBe('none');
      expect(els.overlay.style.opacity).toBe('1');

      expect(els.effectName.textContent).toBe('My Style Name');
      expect(els.effectTracking.textContent).toBe('my-style');
    });

    it('warns and sets fallback labels when style does not exist in loadedGhostyles', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      state.activeEffect = 'missing-style';

      const btn1 = document.createElement('button');
      effectSelected(btn1);

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(els.effectName.textContent).toBe('not_available_label');
      expect(els.effectTracking.textContent).toBe('off_status');
    });

    it('handles missing elements gracefully', () => {
      const originalContainer = els.ghostylesContainer;
      const originalPreviewImage = els.previewImage;
      const originalScanBtn = els.scanBtn;
      const originalOverlay = els.overlay;
      const originalEffectName = els.effectName;
      const originalEffectTracking = els.effectTracking;

      els.ghostylesContainer = null;
      els.previewImage = null;
      els.scanBtn = null;
      els.overlay = null;
      els.effectName = null;
      els.effectTracking = null;

      const btn = document.createElement('button');
      
      // Test when style is NOT found
      state.activeEffect = 'missing-style';
      expect(() => effectSelected(btn)).not.toThrow();

      // Test when style IS found but elements are null
      state.activeEffect = 'my-style';
      state.loadedGhostyles.set('my-style', { name: 'My Style Name' });
      expect(() => effectSelected(btn)).not.toThrow();

      // Restore
      els.ghostylesContainer = originalContainer;
      els.previewImage = originalPreviewImage;
      els.scanBtn = originalScanBtn;
      els.overlay = originalOverlay;
      els.effectName = originalEffectName;
      els.effectTracking = originalEffectTracking;
    });
  });
});

