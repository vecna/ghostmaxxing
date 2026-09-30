import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../lab-js/dom.js', () => ({
  setStatus: vi.fn(),
  clearOverlay: vi.fn(),
  els: {
    video: {
      srcObject: null,
      style: {},
      onloadedmetadata: null,
      play: vi.fn(async () => {}),
      videoWidth: 1920,
      videoHeight: 1080
    },
    overlay: {
      style: {},
      width: 0,
      height: 0,
      offsetHeight: 20
    },
    viewer: {
      getBoundingClientRect: vi.fn(() => ({ width: 640, height: 480 }))
    },
    placeholder: {
      style: { display: 'grid' }
    },
    mirrorToggle: {
      classList: { toggle: vi.fn() },
      textContent: ''
    },
    fpsSelect: {
      value: '120'
    },
    recordBtn: {
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      },
      disabled: false
    }
  }
}));

vi.mock('../../lab-js/utils.js', () => ({
  setLog: vi.fn()
}));

vi.mock('../../lab-js/engine.js', () => ({
  runEffectPass: vi.fn()
}));

import { state } from '../../lab-js/state.js';
import { setStatus, clearOverlay, els } from '../../lab-js/dom.js';
import { setLog } from '../../lab-js/utils.js';
import { runEffectPass } from '../../lab-js/engine.js';
import {
  startCamera,
  resizeCanvas,
  effectLoopHandle,
  effectLoop,
  startEffectLoop,
  stopEffectLoop,
  recordOneSecond
} from '../../lab-js/camera.js';

describe('camera module', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    if (!els.mirrorToggle) {
      els.mirrorToggle = { classList: { toggle: vi.fn() }, textContent: '' };
    }
    if (!els.recordBtn) {
      els.recordBtn = { classList: { add: vi.fn(), remove: vi.fn() }, disabled: false };
    }

    state.currentFacingMode = 'user';
    state.isMirrored = false;
    state.lastEffectRun = 0;
    state.effectInferenceInFlight = true;
    state.overlayFadeTimeout = null;

    els.video.srcObject = null;
    els.video.style.transform = '';
    els.video.videoWidth = 1920;
    els.video.videoHeight = 1080;
    els.overlay.style.transform = '';
    els.overlay.style.transition = '';
    els.overlay.style.opacity = '';
    els.overlay.width = 0;
    els.overlay.height = 0;
    els.placeholder.style.display = 'grid';
    els.mirrorToggle.textContent = '';
    els.fpsSelect.value = '120';

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => ({ id: 'stream' }))
      },
      configurable: true
    });

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 321));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('startCamera throws and logs when mediaDevices API is unavailable', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true
    });

    await expect(startCamera()).rejects.toThrow('mediaDevices unavailable (insecure context?)');
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Webcam non disponibile in questo contesto.'));
  });

  it('startCamera initializes stream, UI state and starts effect loop', async () => {
    const startPromise = startCamera();
    await Promise.resolve();

    expect(typeof els.video.onloadedmetadata).toBe('function');
    els.video.onloadedmetadata();
    await startPromise;

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: 'user'
      },
      audio: false
    });
    expect(els.video.srcObject).toEqual({ id: 'stream' });
    expect(state.isMirrored).toBe(true);
    expect(els.video.style.transform).toBe('scaleX(-1)');
    expect(els.overlay.style.transform).toBe('scaleX(-1)');
    expect(els.placeholder.style.display).toBe('none');
    expect(setStatus).toHaveBeenCalledWith('live', 'webcam attiva');
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Webcam attiva.'));
    expect(els.overlay.width).toBe(1920);
    expect(els.overlay.height).toBe(1080);
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('startCamera handles a secure context without mediaDevices', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    await expect(startCamera()).rejects.toThrow('mediaDevices unavailable (insecure context?)');
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Webcam non disponibile'));
  });

  it('startCamera propagates getUserMedia rejection and configures rear-camera mirroring', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('permission denied'));
    await expect(startCamera()).rejects.toThrow('permission denied');

    state.currentFacingMode = 'environment';
    const pending = startCamera();
    await Promise.resolve();
    els.video.onloadedmetadata();
    await pending;
    expect(state.isMirrored).toBe(false);
    expect(els.video.style.transform).toBe('scaleX(1)');
    expect(els.overlay.style.transform).toBe('scaleX(1)');
    expect(els.mirrorToggle.textContent).toBe('Webcam speculare');
  });

  it('resizeCanvas falls back to viewer rect before video dimensions are available', () => {
    els.video.videoWidth = 0;
    els.video.videoHeight = 0;

    resizeCanvas();

    expect(els.overlay.width).toBe(640);
    expect(els.overlay.height).toBe(480);
  });



  it('effectLoop triggers inference based on selected delay and re-schedules itself',  async () => {
    state.lastEffectRun = 0;
    els.fpsSelect.value = '100';

    await effectLoop(150);

    expect(runEffectPass).toHaveBeenCalledTimes(1);
    expect(state.lastEffectRun).toBe(150);
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(effectLoopHandle).toBe(321);
  });

  it('effectLoop uses the default delay and clears the overlay on a positive result', async () => {
    els.fpsSelect.value = 'invalid';
    state.lastEffectRun = 0;
    await effectLoop(0);
    expect(runEffectPass).not.toHaveBeenCalled();

    els.fpsSelect.value = '10';
    runEffectPass.mockResolvedValueOnce(true);
    await effectLoop(11);
    expect(clearOverlay).toHaveBeenCalled();
  });

  it('startEffectLoop cancels previous frame and schedules a new one', () => {
    startEffectLoop();

    requestAnimationFrame.mockReturnValueOnce(654);

    startEffectLoop();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(321);
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(effectLoopHandle).toBe(654);
  });

  it('startEffectLoop schedules without cancelling when no frame is active', () => {
    stopEffectLoop();
    expect(effectLoopHandle).toBeNull();
    stopEffectLoop();
    cancelAnimationFrame.mockClear();
    startEffectLoop();
    expect(cancelAnimationFrame).not.toHaveBeenCalled();
  });

  it('stopEffectLoop cancels frame and resets loop state flags', () => {
    startEffectLoop();
    state.effectInferenceInFlight = true;

    stopEffectLoop();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(321);
    expect(effectLoopHandle).toBe(null);
    expect(state.effectInferenceInFlight).toBe(false);
  });

  describe('recordOneSecond', () => {
    let mockMediaRecorderStart;
    let mockMediaRecorderStop;
    let supportedTypes;
    let latestRecorder;

    beforeEach(() => {
      vi.useFakeTimers();
      mockMediaRecorderStart = vi.fn();
      mockMediaRecorderStop = vi.fn();
      supportedTypes = ['video/mp4;codecs=h264'];
      latestRecorder = null;

      class MockMediaRecorder {
        constructor(stream, options) {
          this.stream = stream;
          this.options = options;
          this.state = 'inactive';
          latestRecorder = this;
        }
        start() {
          this.state = 'recording';
          mockMediaRecorderStart();
        }
        stop() {
          this.state = 'inactive';
          mockMediaRecorderStop();
          if (this.onstop) this.onstop();
        }
      }
      MockMediaRecorder.isTypeSupported = vi.fn(type => supportedTypes.includes(type));
      vi.stubGlobal('MediaRecorder', MockMediaRecorder);
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));

      els.video.srcObject = { id: 'camera-stream' };
      state.isRecording = false;
      state.isSystemBusy = false;
      state.gstmxxEvents = new EventTarget();
      if (els.recordBtn) {
        els.recordBtn.disabled = false;
        els.recordBtn.classList.add.mockClear();
        els.recordBtn.classList.remove.mockClear();
      }
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sets recording state, adds classes, starts recorder, and stops after durationMs', async () => {
      const clipRecorded = vi.fn();
      state.gstmxxEvents.addEventListener('clipRecorded', clipRecorded);
      await recordOneSecond();

      expect(state.isRecording).toBe(true);
      expect(els.recordBtn.classList.add).toHaveBeenCalledWith('recording');
      expect(els.recordBtn.disabled).toBe(true);
      expect(mockMediaRecorderStart).toHaveBeenCalledTimes(1);

      // Fast-forward 2 seconds
      vi.advanceTimersByTime(2000);

      expect(mockMediaRecorderStop).toHaveBeenCalledTimes(1);
      expect(state.isRecording).toBe(false);
      expect(els.recordBtn.classList.remove).toHaveBeenCalledWith('recording');
      expect(els.recordBtn.disabled).toBe(false);
      expect(clipRecorded).toHaveBeenCalledOnce();
      expect(clipRecorded.mock.calls[0][0].detail).toMatchObject({ extension: 'mp4', mimeType: 'video/mp4;codecs=h264' });
    });

    it('selects each supported recorder type and ignores empty chunks', async () => {
      for (const [types, expectedType] of [
        [['video/mp4'], 'video/mp4'],
        [['video/webm;codecs=vp9'], 'video/webm;codecs=vp9'],
        [['video/webm;codecs=vp8'], 'video/webm;codecs=vp8'],
        [[], 'video/webm'],
      ]) {
        supportedTypes = types;
        await recordOneSecond();
        expect(latestRecorder.options.mimeType).toBe(expectedType);
        latestRecorder.ondataavailable({ data: { size: 0 } });
        latestRecorder.ondataavailable({ data: new Blob(['chunk']) });
        latestRecorder.state = 'inactive';
        await vi.advanceTimersByTimeAsync(2000);
        expect(mockMediaRecorderStop).not.toHaveBeenCalled();
        await latestRecorder.onstop();
      }
    });

    it('refuses busy or inactive-stream captures and restores state after recorder errors', async () => {
      state.isRecording = true;
      await recordOneSecond();
      state.isRecording = false;
      state.isSystemBusy = true;
      await recordOneSecond();
      state.isSystemBusy = false;
      els.video.srcObject = null;
      await recordOneSecond();
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('stream'));

      els.video.srcObject = { id: 'camera-stream' };
      const recordButton = els.recordBtn;
      class BrokenRecorder {
        constructor() { throw new Error('recorder unavailable'); }
      }
      BrokenRecorder.isTypeSupported = () => false;
      vi.stubGlobal('MediaRecorder', BrokenRecorder);
      await recordOneSecond();
      expect(state.isRecording).toBe(false);
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('recorder unavailable'));
      els.recordBtn = null;
      await recordOneSecond();
      expect(state.isRecording).toBe(false);
      els.recordBtn = recordButton;
    });

    it('uses the fallback clip id and tolerates a missing record button', async () => {
      const originalButton = els.recordBtn;
      els.recordBtn = null;
      vi.stubGlobal('crypto', {});
      await recordOneSecond();
      await latestRecorder.onstop();
      expect(state.isRecording).toBe(false);
      els.recordBtn = originalButton;
    });
  });
});
