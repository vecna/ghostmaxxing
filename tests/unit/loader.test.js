import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  modelsReady: false,
  session: null,
  listener: null,
  loadModels: vi.fn(),
  loadFile: vi.fn(),
  analyze: vi.fn(),
  analyzeFrame: vi.fn(),
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
    analyzeFrame: runtime.analyzeFrame,
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
    source: { name: 'tutorial.webm', size: 2048, duration: 20, width: 1280, height: 720 },
    status,
    config: { sampleIntervalSeconds: 0.5 },
    baseline: null,
    samples: [],
    events: [],
    journal: [],
    summary: { sampledFrames: 0, faceApiRuns: 0, confirmedEvents: 0, manualChecks: 0 },
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
      runtime.listener?.({
        type: 'sample',
        session: runtime.session,
        phase: 'scan',
        progress: 1,
        scanSampleIndex: 1,
        scanSampleTotal: 1,
      });
      return runtime.session;
    });
    runtime.analyzeFrame.mockReset();
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
    expect(document.getElementById('sourceFileName').textContent).toBe('tutorial.webm');
    expect(document.getElementById('sourceFileMeta').textContent).toContain('1280 × 720');
    expect(document.getElementById('startAnalysisBtn').disabled).toBe(true);

    runtime.session.baseline = {
      mediaTime: 12.5,
      visualTriggerThreshold: 0.1234,
      faceSpread: 0.0456,
      frame: {
        mediaTime: 12.5,
        dataUrl: 'data:image/jpeg;base64,AA==',
      },
    };
    runtime.listener({ type: 'baseline-ready', session: runtime.session });
    const baselineCard = document.querySelector('.loader-event--reference[data-event-id="baseline"]');
    expect(baselineCard).not.toBeNull();
    expect(baselineCard.querySelector('h3').textContent).toBe('Baseline · distance reference · 00:12.500');
    expect(baselineCard.querySelector('.loader-event__metrics').textContent).toContain('face-api decision threshold 0.6000');

    document.getElementById('video').currentTime = 12.5;
    document.getElementById('video').dispatchEvent(new Event('timeupdate'));
    expect(document.getElementById('selectBaseBtn').textContent).toBe('Select base at 00:12.500');
    document.getElementById('selectBaseBtn').click();
    expect(document.getElementById('selectedBaseLabel').textContent).toContain('selected at 00:12.500');
    expect(document.getElementById('startAnalysisBtn').disabled).toBe(false);

    await window.gstmxxVideoLoader.analyze({ sampleIntervalSeconds: 1 });
    expect(runtime.analyze).toHaveBeenCalledWith(expect.objectContaining({
      sampleIntervalSeconds: 1,
      baselineTime: 12.5,
      baselineSelectionMode: 'anchored',
    }));
    expect(document.getElementById('analysisProgressLabel').textContent).toBe('1 / 1 samples · 100%');
    expect(document.getElementById('downloadReportBtn').disabled).toBe(false);

    window.gstmxxVideoLoader.cancel();
    expect(runtime.cancel).toHaveBeenCalled();
    expect(window.gstmxxVideoLoader.exportBundle()).toEqual({ report: {}, technicalLog: '{}\n', frames: [] });
  });

  it('turns a cancelled run into a resumable sample checkpoint', async () => {
    let run = 0;
    runtime.analyze.mockImplementation(async options => {
      run += 1;
      if (run === 1) {
        runtime.session.status = 'cancelled';
        runtime.listener?.({
          type: 'sample',
          session: runtime.session,
          phase: 'scan',
          progress: 0.4,
          scanSampleIndex: 4,
          scanSampleTotal: 10,
          sample: { mediaTime: 8 },
        });
        runtime.listener?.({
          type: 'analysis-cancelled',
          session: runtime.session,
          progress: 0.4,
          scanSampleIndex: 4,
          scanSampleTotal: 10,
          mediaTime: 8,
        });
      } else {
        expect(options.resume).toBe(true);
        runtime.session.status = 'complete';
        runtime.listener?.({
          type: 'analysis-complete',
          session: runtime.session,
          progress: 1,
          scanSampleIndex: 10,
          scanSampleTotal: 10,
          mediaTime: 20,
        });
      }
      return runtime.session;
    });

    await import('../../lab-js/loader.js?loader-resume');
    await flushPromises();
    const input = document.getElementById('videoFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'tutorial.webm', { type: 'video/webm' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    document.getElementById('selectBaseBtn').click();
    document.getElementById('startAnalysisBtn').click();
    await flushPromises();

    expect(document.getElementById('startAnalysisBtn').textContent).toBe('Resume analysis');
    expect(document.getElementById('analysisProgressLabel').textContent).toBe('4 / 10 samples · paused at 00:08.000');
    expect(document.getElementById('videoSeek').disabled).toBe(false);
    expect(document.querySelector('.loader-source-controls').classList.contains('is-muted')).toBe(false);

    document.getElementById('startAnalysisBtn').click();
    await flushPromises();
    expect(runtime.analyze).toHaveBeenLastCalledWith(expect.objectContaining({ resume: true }));
    expect(document.getElementById('analysisProgressLabel').textContent).toBe('10 / 10 samples · complete');
  });

  it('restarts and recalculates the scan when paused sampling changes', async () => {
    let run = 0;
    runtime.analyze.mockImplementation(async options => {
      run += 1;
      if (run === 1) {
        runtime.session.status = 'cancelled';
        runtime.session.config.sampleIntervalSeconds = options.sampleIntervalSeconds;
        runtime.listener?.({
          type: 'analysis-cancelled',
          session: runtime.session,
          progress: 0.4,
          scanSampleIndex: 4,
          scanSampleTotal: 10,
          mediaTime: 8,
        });
      } else {
        runtime.session.status = 'complete';
      }
      return runtime.session;
    });

    await import('../../lab-js/loader.js?loader-restart-cadence');
    await flushPromises();
    const input = document.getElementById('videoFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'tutorial.webm', { type: 'video/webm' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    document.getElementById('selectBaseBtn').click();
    document.getElementById('startAnalysisBtn').click();
    await flushPromises();

    const sampleInterval = document.getElementById('sampleInterval');
    sampleInterval.value = '2';
    sampleInterval.dispatchEvent(new Event('change'));
    expect(document.getElementById('startAnalysisBtn').textContent).toBe('Restart with new sampling');

    document.getElementById('startAnalysisBtn').click();
    await flushPromises();
    expect(runtime.analyze).toHaveBeenLastCalledWith(expect.objectContaining({
      resume: false,
      sampleIntervalSeconds: 2,
    }));
  });

  it('restarts instead of resuming when the paused baseline changes', async () => {
    let run = 0;
    runtime.analyze.mockImplementation(async options => {
      run += 1;
      if (run === 1) {
        runtime.session.status = 'cancelled';
        runtime.session.baseline = { mediaTime: options.baselineTime };
        runtime.listener?.({
          type: 'analysis-cancelled',
          session: runtime.session,
          progress: 0.4,
          scanSampleIndex: 4,
          scanSampleTotal: 10,
          mediaTime: 8,
        });
      } else {
        runtime.session.status = 'complete';
      }
      return runtime.session;
    });

    await import('../../lab-js/loader.js?loader-restart-baseline');
    await flushPromises();
    const input = document.getElementById('videoFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'tutorial.webm', { type: 'video/webm' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    document.getElementById('selectBaseBtn').click();
    document.getElementById('startAnalysisBtn').click();
    await flushPromises();

    document.getElementById('video').currentTime = 9;
    document.getElementById('selectBaseBtn').click();
    expect(document.getElementById('startAnalysisBtn').textContent).toBe('Restart with new baseline');

    document.getElementById('startAnalysisBtn').click();
    await flushPromises();
    expect(runtime.analyze).toHaveBeenLastCalledWith(expect.objectContaining({
      resume: false,
      baselineTime: 9,
    }));
  });

  it('mutes source navigation while the controller owns video time', async () => {
    let finishAnalysis;
    runtime.analyze.mockImplementation(() => new Promise(resolve => {
      finishAnalysis = () => {
        runtime.session.status = 'complete';
        resolve(runtime.session);
      };
    }));

    await import('../../lab-js/loader.js?loader-muted-controls');
    await flushPromises();
    const input = document.getElementById('videoFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'tutorial.webm', { type: 'video/webm' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    document.getElementById('selectBaseBtn').click();
    document.getElementById('startAnalysisBtn').click();
    await flushPromises();

    expect(document.querySelector('.loader-source-controls').classList.contains('is-muted')).toBe(true);
    expect(document.getElementById('analysisSettings').classList.contains('is-muted')).toBe(true);
    expect(document.getElementById('videoSeek').disabled).toBe(true);
    expect(document.getElementById('video').inert).toBe(true);
    expect(document.getElementById('analysisLockNotice').hidden).toBe(false);
    expect(document.getElementById('cancelAnalysisBtn').disabled).toBe(false);

    finishAnalysis();
    await flushPromises();
    expect(document.querySelector('.loader-source-controls').classList.contains('is-muted')).toBe(false);
    expect(document.getElementById('video').inert).toBe(false);
  });

  it('adds a person-requested frame check after a baseline exists', async () => {
    runtime.analyzeFrame.mockImplementation(async mediaTime => {
      const event = {
        id: 'event-manual',
        origin: 'manual',
        status: 'confirmed',
        classification: 'manual-frame-check',
        interpretation: 'above-threshold',
        anchorMediaTime: mediaTime,
        caption: '',
        promoted: false,
        observations: [{
          mediaTime,
          faceDistance: 0.71,
          faceThreshold: 0.6,
          visualDrift: 0.12,
          reasons: ['manual-frame-check'],
        }],
        selectedFrame: { mediaTime, dataUrl: 'data:image/jpeg;base64,AA==', sharpness: 0.2 },
      };
      runtime.session.events.push(event);
      runtime.session.editorial.storyOrder.push(event.id);
      runtime.session.summary.manualChecks += 1;
      runtime.listener?.({ type: 'manual-frame-checked', session: runtime.session, event });
      return event;
    });

    await import('../../lab-js/loader.js?loader-manual-frame');
    await flushPromises();
    const input = document.getElementById('videoFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'rainbow.webm', { type: 'video/webm' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    runtime.session.baseline = {
      mediaTime: 0,
      visualTriggerThreshold: 0.04,
      faceSpread: 0.02,
      frame: { mediaTime: 0, dataUrl: 'data:image/jpeg;base64,AA==' },
    };
    runtime.listener?.({ type: 'baseline-ready', session: runtime.session });
    document.getElementById('video').currentTime = 7;
    document.getElementById('video').dispatchEvent(new Event('timeupdate'));

    expect(document.getElementById('analyzeFrameBtn').disabled).toBe(false);
    expect(document.getElementById('analyzeFrameBtn').textContent).toBe('Analyse frame at 00:07.000');
    document.getElementById('analyzeFrameBtn').click();
    await flushPromises();

    expect(runtime.analyzeFrame).toHaveBeenCalledWith(7);
    expect(document.querySelector('.loader-event--manual h3').textContent).toContain('Manual frame check');
    expect(document.getElementById('analysisMessage').textContent).toContain('face-api distance 0.7100');
  });

  it('keeps an actionable baseline failure beside the run controls', async () => {
    runtime.analyze.mockImplementation(async options => {
      runtime.session.status = 'failed';
      runtime.listener?.({
        type: 'sample',
        session: runtime.session,
        phase: 'baseline',
        baselineAcceptedSamples: 6,
        baselineRequiredSamples: 4,
        baselineAcceptedDescriptors: 2,
        baselineRequiredDescriptors: 3,
      });
      runtime.listener?.({
        type: 'analysis-failed',
        session: runtime.session,
        reason: 'selected-frame-neighbours-insufficient',
        baselineTime: options.baselineTime,
        baselineSearchEnd: options.baselineTime + 3,
        acceptedEmbeddings: 2,
        requiredEmbeddings: 4,
        acceptedDescriptors: 0,
        requiredDescriptors: 3,
      });
      throw new Error('baseline failed');
    });

    await import('../../lab-js/loader.js?loader-baseline-failure');
    await flushPromises();
    const input = document.getElementById('videoFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'short.webm', { type: 'video/webm' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    document.getElementById('selectBaseBtn').click();
    document.getElementById('startAnalysisBtn').click();
    await flushPromises();

    expect(document.getElementById('analysisMessage').hidden).toBe(false);
    expect(document.getElementById('analysisProgressLabel').textContent).toBe('baseline face-api 2 / 3');
    expect(document.getElementById('analysisMessage').textContent).toContain('only 2 of 4 comparable nearby frames');
    expect(document.getElementById('analysisMessage').textContent).toContain('Makeup already being present is not itself an error');
    expect(document.getElementById('statusText').textContent).toBe('baseline not created');
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
