import { afterEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  compositeAndDetect: vi.fn(), evaluateMatch: vi.fn(), detectFaceInCam: vi.fn(),
  hasActivePlugin: vi.fn(), seekFaceInDb: vi.fn(), findFace3d: vi.fn(), evaluateMatch3d: vi.fn(),
}));

vi.mock('../../lab-js/engine.js', () => ({
  compositeAndDetect: deps.compositeAndDetect, evaluateMatch: deps.evaluateMatch,
  detectFaceInCam: deps.detectFaceInCam, hasActivePlugin: deps.hasActivePlugin,
  seekFaceInDb: deps.seekFaceInDb,
}));
vi.mock('../../lab-js/engine-3d.js', () => ({ findFace3d: deps.findFace3d, evaluateMatch3d: deps.evaluateMatch3d }));
vi.mock('../../lab-js/i18n.js', () => ({ t: key => key }));

import { state } from '../../lab-js/state.js';
import '../../lab-js/auto-find-loop.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('auto-find-loop', () => {
  it('waits for readiness, skips empty detections, builds combined results, and contains errors', async () => {
    vi.useFakeTimers();
    state.db = { faces: [] };
    state.gstmxxEvents = new EventTarget();
    deps.detectFaceInCam.mockResolvedValue(null);
    deps.hasActivePlugin.mockReturnValue(false);
    const events = [];
    state.gstmxxEvents.addEventListener('matchStateChanged', event => events.push(event.detail));

    window.dispatchEvent(new CustomEvent('gstmxxReady'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.detectFaceInCam).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.detectFaceInCam).toHaveBeenCalledOnce();
    expect(deps.findFace3d).not.toHaveBeenCalled();

    deps.detectFaceInCam.mockResolvedValue({ descriptor: [1] });
    deps.findFace3d.mockResolvedValue(null);
    deps.evaluateMatch3d.mockReturnValue(null);
    await vi.advanceTimersByTimeAsync(2000);
    expect(events.at(-1)).toMatchObject({ source: 'auto', faceapi: null, mediapipe: null, overall: 'unknown' });

    state.db.faces = [{ id: 4 }];
    deps.hasActivePlugin.mockReturnValue(true);
    deps.compositeAndDetect.mockResolvedValue({ canvas: document.createElement('canvas') });
    deps.seekFaceInDb.mockReturnValue({ liveMinDist: 0.2, liveMinId: 4 });
    deps.evaluateMatch.mockReturnValue({ detail: {
      detectionState: 'matched', distance: 0.2, matchedId: 4, obfMinDist: undefined, obfMinId: 4,
    } });
    deps.findFace3d.mockResolvedValue({ embedding: [0.1] });
    deps.evaluateMatch3d.mockReturnValue({ detectionState: 'matched', similarity: 0.9 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.compositeAndDetect).toHaveBeenCalledWith({ descriptor: [1] });
    expect(deps.findFace3d).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement));
    expect(events.at(-1)).toMatchObject({ overall: 'matched', ghostylePresent: true });
    expect(events.at(-1).faceapi).toMatchObject({ obfMinDist: null, obfMinId: 4 });

    deps.hasActivePlugin.mockReturnValue(false);
    deps.evaluateMatch.mockReturnValue({ detail: {
      detectionState: 'eluded', distance: 0.8, matchedId: null, obfMinDist: 0, obfMinId: 0,
    } });
    deps.evaluateMatch3d.mockReturnValue({ detectionState: 'matched' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.findFace3d).toHaveBeenLastCalledWith(null);
    expect(events.at(-1).overall).toBe('partial-elusion');
    expect(events.at(-1).faceapi).toMatchObject({ obfMinDist: 0, obfMinId: 0 });

    deps.evaluateMatch.mockReturnValue({ detail: { detectionState: 'eluded' } });
    deps.evaluateMatch3d.mockReturnValue({ detectionState: 'eluded' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(events.at(-1).overall).toBe('eluded');

    deps.evaluateMatch3d.mockReturnValue(null);
    await vi.advanceTimersByTimeAsync(2000);
    expect(events.at(-1).overall).toBe('unknown');

    const error = new Error('detector failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    deps.detectFaceInCam.mockRejectedValueOnce(error);
    await vi.advanceTimersByTimeAsync(2000);
    expect(consoleError).toHaveBeenCalledWith('console_auto_find_tick_error', error);
  });
});