import { describe, expect, it } from 'vitest';
import {
  appendJournal,
  appendSample,
  applyEditorialCommand,
  buildReport,
  createAnalysisSession,
  recordEvidenceObservation,
  recordManualFrameCheck,
  redoEditorialCommand,
  selectEventFrame,
  serializeTechnicalLog,
  undoEditorialCommand,
} from '../../lab-js/video-loader/session.js';

describe('video-loader session', () => {
  function session() {
    return createAnalysisSession({ name: 'tutorial.webm', size: 42, type: 'video/webm', duration: 10 }, {
      faceDistanceThreshold: 0.6,
    });
  }

  it('keeps technical samples separate from report image bytes', () => {
    const current = session();
    current.models = { faceApi: 'vendor' };
    current.baseline = {
      mediaTime: 1,
      faceSpread: 0.02,
      embeddingMedianDrift: 0.01,
      embeddingMad: 0.002,
      visualTriggerThreshold: 0.04,
      frame: { mediaTime: 1, width: 1920, height: 1080, dataUrl: 'data:image/jpeg;base64,baseline' },
    };
    appendSample(current, { mediaTime: 1, facePresent: true, visualDrift: 0.01 });
    appendJournal(current, 'face-api-result', { mediaTime: 1, faceDistance: 0.2 });

    const first = recordEvidenceObservation(current, {
      mediaTime: 5,
      outcome: 'divergent',
      faceDistance: 0.72,
      visualDrift: 0.1,
      reasons: ['visual-drift-sustained'],
      quality: { sharpness: 0.1 },
    });
    const confirmed = recordEvidenceObservation(current, {
      mediaTime: 5.5,
      outcome: 'divergent',
      faceDistance: 0.75,
      visualDrift: 0.12,
      reasons: ['visual-drift-sustained'],
      quality: { sharpness: 0.2 },
    });
    expect(confirmed).toBe(first);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.classification).toBe('identity-distance');
    expect(confirmed.reviewRequired).toBe(false);
    selectEventFrame(confirmed, {
      mediaTime: 5.5,
      dataUrl: 'data:image/jpeg;base64,event',
      width: 1920,
      height: 1080,
      sharpness: 0.2,
      reason: 'best',
    });

    current.status = 'complete';
    const report = buildReport(current);
    const log = serializeTechnicalLog(current);
    expect(report.events).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain('base64,event');
    expect(log).not.toContain('base64');
    expect(log.trim().split('\n').map(line => JSON.parse(line)).at(-1)).toMatchObject({
      type: 'analysis-footer',
      status: 'complete',
    });
  });

  it('marks repeated face-api misses as reviewable detector divergence', () => {
    const current = session();
    recordEvidenceObservation(current, {
      mediaTime: 2,
      outcome: 'divergent',
      mediaPipeComparable: true,
      faceApiDetected: false,
      faceDistance: null,
      faceThreshold: 0.6,
      reasons: ['face-returned'],
    });
    const event = recordEvidenceObservation(current, {
      mediaTime: 3,
      outcome: 'divergent',
      mediaPipeComparable: true,
      faceApiDetected: false,
      faceDistance: null,
      faceThreshold: 0.6,
      reasons: ['visual-drift-sustained'],
    });
    expect(event.status).toBe('confirmed');
    expect(event.classification).toBe('detector-divergence');
    expect(event.reviewRequired).toBe(true);
  });

  it('does not confirm missing detections from unusable MediaPipe crops', () => {
    const current = session();
    recordEvidenceObservation(current, {
      mediaTime: 2,
      outcome: 'divergent',
      mediaPipeComparable: false,
      faceApiDetected: false,
      faceDistance: null,
      faceThreshold: 0.6,
      reasons: ['identity-heartbeat'],
    });
    const event = recordEvidenceObservation(current, {
      mediaTime: 3,
      outcome: 'divergent',
      mediaPipeComparable: false,
      faceApiDetected: false,
      faceDistance: null,
      faceThreshold: 0.6,
      reasons: ['identity-heartbeat'],
    });
    expect(event.status).toBe('candidate');
    expect(event.classification).toBe('unclassified');
    expect(current.summary.confirmedEvents).toBe(0);
  });

  it('supports reversible editorial choices', () => {
    const current = session();
    const event = recordEvidenceObservation(current, {
      mediaTime: 2,
      outcome: 'divergent',
      faceDistance: 0.7,
      visualDrift: 0.08,
      reasons: [],
    });
    expect(applyEditorialCommand(current, { type: 'promote', eventId: event.id })).toBe(true);
    expect(event.promoted).toBe(true);
    expect(undoEditorialCommand(current)).toBe(true);
    expect(event.promoted).toBe(false);
    expect(redoEditorialCommand(current)).toBe(true);
    expect(event.promoted).toBe(true);
  });

  it('stores a requested frame as a distinct manual story check', () => {
    const current = session();
    current.baseline = {
      mediaTime: 1,
      descriptor: [0, 0],
      faceSpread: 0.02,
      embeddingMedianDrift: 0.01,
      embeddingMad: 0.002,
      visualTriggerThreshold: 0.04,
      frame: null,
    };
    const event = recordManualFrameCheck(current, {
      mediaTime: 6,
      interpretation: 'above-threshold',
      observation: {
        mediaTime: 6,
        outcome: 'divergent',
        mediaPipeComparable: true,
        faceApiDetected: true,
        faceDistance: 0.72,
        faceThreshold: 0.6,
        visualDrift: 0.11,
        reasons: ['manual-frame-check'],
      },
      frame: {
        mediaTime: 6,
        dataUrl: 'data:image/jpeg;base64,manual',
        width: 1920,
        height: 1080,
        sharpness: 0.2,
        reason: 'manual-frame-check',
      },
    });

    expect(event).toMatchObject({
      origin: 'manual',
      classification: 'manual-frame-check',
      status: 'confirmed',
    });
    expect(current.summary.manualChecks).toBe(1);
    expect(current.summary.confirmedEvents).toBe(0);
    expect(current.editorial.storyOrder).toEqual(['baseline', event.id]);
    expect(buildReport(current).events[0]).toMatchObject({
      origin: 'manual',
      interpretation: 'above-threshold',
    });
    const log = serializeTechnicalLog(current);
    expect(log).toContain('manual-frame-checked');
    expect(log).not.toContain('base64,manual');
  });

  it('keeps source time fixed while a person reorders the story', () => {
    const current = session();
    current.baseline = {
      mediaTime: 5,
      faceSpread: 0.02,
      embeddingMedianDrift: 0.01,
      embeddingMad: 0.002,
      visualTriggerThreshold: 0.04,
      frame: null,
    };
    recordEvidenceObservation(current, {
      mediaTime: 1,
      outcome: 'divergent',
      mediaPipeComparable: true,
      faceApiDetected: false,
      faceDistance: null,
      faceThreshold: 0.6,
      reasons: [],
    });
    const event = recordEvidenceObservation(current, {
      mediaTime: 2,
      outcome: 'divergent',
      mediaPipeComparable: true,
      faceApiDetected: false,
      faceDistance: null,
      faceThreshold: 0.6,
      reasons: [],
    });
    expect(current.editorial.storyOrder).toEqual(['baseline', event.id]);
    expect(applyEditorialCommand(current, { type: 'move-later', eventId: 'baseline' })).toBe(false);
    expect(applyEditorialCommand(current, { type: 'move-earlier', eventId: event.id })).toBe(false);
    expect(current.editorial.storyOrder).toEqual(['baseline', event.id]);
    expect(event.anchorMediaTime).toBe(1);
    expect(buildReport(current).storyOrder).toEqual(['baseline', event.id]);
  });
});
