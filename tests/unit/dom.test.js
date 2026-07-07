import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { state } from '../../scripts/state.js';
import {
  els,
  setStatus,
  clearOverlay,
  clearActiveEffect,
  effectSelected
} from '../../scripts/dom.js';

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

});
