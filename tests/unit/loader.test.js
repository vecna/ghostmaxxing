import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  modelsReady: false,
  session: null,
  listener: null,
  loadModels: vi.fn(),
  loadFile: vi.fn(),
  analyze: vi.fn(),
  cancel: vi.fn(),
  exportBundle: vi.fn(),
}));

vi.mock('../../lab-js/i18n.js', () => ({
  initI18n: vi.fn(),
  setupLocaleSelect: vi.fn(),
  applyI18n: vi.fn(),
}));

vi.mock('../../lab-js/video-loader/controller.js', () => ({
  createVideoAnalysisController: () => ({
    loadModels: runtime.loadModels,
    loadFile: runtime.loadFile,
    analyze: runtime.analyze,
    cancel: runtime.cancel,
    exportBundle: runtime.exportBundle,
    getSession: () => runtime.session,
    isModelsReady: () => runtime.modelsReady,
    subscribe: listener => { runtime.listener = listener; return () => {}; },
  }),
}));

vi.mock('../../lab-js/video-loader/session.js', () => ({
  applyEditorialCommand: vi.fn(),
  undoEditorialCommand: vi.fn(),
  redoEditorialCommand: vi.fn(),
}));

function loaderMarkup() {
  const source = readFileSync(`${process.cwd()}/loader.html`, 'utf8');
  return new DOMParser().parseFromString(source, 'text/html').body.innerHTML;
}

function makeSession(status = 'idle') {
  return {
    source: { name: 'tutorial.webm', duration: 20 },
    status,
    baseline: null,
    samples: [],
    events: [],
    journal: [],
    summary: { sampledFrames: 0, faceApiRuns: 0, confirmedEvents: 0 },
    editorial: { storyOrder: ['baseline'], undo: [], redo: [] },
  };
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe('loader UI adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = loaderMarkup();
    runtime.modelsReady = false;
    runtime.session = null;
    runtime.listener = null;
    runtime.loadModels.mockImplementation(async () => {
      runtime.modelsReady = true;
      runtime.listener?.({ type: 'models-ready', session: runtime.session });
    });
    runtime.loadFile.mockImplementation(async file => {
      runtime.session = makeSession();
      runtime.session.source.name = file.name;
      return runtime.session;
    });
    runtime.analyze.mockImplementation(async () => {
      runtime.session.status = 'complete';
      runtime.session.samples.push({ mediaTime: 1, facePresent: true, visualDrift: null });
      runtime.session.summary.sampledFrames = 1;
      runtime.listener?.({ type: 'sample', session: runtime.session, progress: 1 });
      return runtime.session;
    });
    runtime.exportBundle.mockReturnValue({ report: {}, technicalLog: '{}\n', frames: [] });

    const video = document.getElementById('video');
    video.load = vi.fn();
    video.pause = vi.fn();
    Object.defineProperties(video, {
      duration: { configurable: true, value: 20 },
      currentTime: { configurable: true, writable: true, value: 0 },
    });
  });

  it('exposes one Playwright API for the same local-file workflow as the UI', async () => {
    await import('../../lab-js/loader.js?new-loader-success');
    await flushPromises();
    expect(window.gstmxxVideoLoader.isModelsReady()).toBe(true);
    expect(document.getElementById('statusText').textContent).toBe('select a local video');

    window.gstmxxVideoLoader.setSourceMetadata({ fingerprint: 'sampled-sha256:test' });
    const input = document.getElementById('videoFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'tutorial.webm', { type: 'video/webm' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(runtime.loadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'tutorial.webm' }), {
      fingerprint: 'sampled-sha256:test',
    });
    expect(window.gstmxxVideoLoader.isSourceLoaded()).toBe(true);
    expect(document.getElementById('startAnalysisBtn').disabled).toBe(false);

    document.getElementById('video').currentTime = 12.5;
    document.getElementById('useCurrentTimeBtn').click();
    expect(document.getElementById('baselineTime').value).toBe('12.500');

    await window.gstmxxVideoLoader.analyze({ sampleIntervalSeconds: 1 });
    expect(runtime.analyze).toHaveBeenCalledWith(expect.objectContaining({ sampleIntervalSeconds: 1 }));
    expect(document.getElementById('analysisProgressLabel').textContent).toBe('100%');
    expect(document.getElementById('downloadReportBtn').disabled).toBe(false);

    window.gstmxxVideoLoader.cancel();
    expect(runtime.cancel).toHaveBeenCalled();
    expect(window.gstmxxVideoLoader.exportBundle()).toEqual({ report: {}, technicalLog: '{}\n', frames: [] });
  });

  it('reports model-loading failures and keeps analysis unavailable', async () => {
    runtime.loadModels.mockRejectedValueOnce(new Error('model unavailable'));
    await import('../../lab-js/loader.js?new-loader-failure');
    await flushPromises();
    expect(document.getElementById('statusText').textContent).toContain('model loading failed');
    expect(document.getElementById('statusDot').classList.contains('error')).toBe(true);
    expect(document.getElementById('startAnalysisBtn').disabled).toBe(true);
  });
});
