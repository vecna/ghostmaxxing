/**
 * @module video-loader/session
 * @description
 * Versioned analysis session, technical journal, and reversible editorial
 * commands for the Video Loader. The technical journal is intentionally
 * independent from the report so it can later drive clip extraction or other
 * post-processing without rendering the editorial output again.
 */

/** Current machine-readable session and log schema version. */
export const VIDEO_ANALYSIS_SCHEMA_VERSION = 2;

/**
 * Creates a stable random identifier with a deterministic fallback for older
 * browsers and constrained test environments.
 *
 * @param {string} prefix Identifier prefix.
 * @returns {string} Unique identifier.
 */
function createId(prefix) {
   const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
   return `${prefix}-${random}`;
}

/**
 * Creates an empty video-analysis session.
 *
 * @param {object} source Source metadata.
 * @param {string} source.name Source filename.
 * @param {number} source.size Source byte size.
 * @param {string} source.type Source media type.
 * @param {number} [source.lastModified] Source modification time.
 * @param {number} [source.duration] Decoded duration.
 * @param {number} [source.width] Decoded width.
 * @param {number} [source.height] Decoded height.
 * @param {string|null} [source.fingerprint] Bounded source fingerprint.
 * @param {object} config Effective analyser configuration.
 * @returns {object} Mutable session owned by one analyser controller.
 */
export function createAnalysisSession(source, config) {
   const createdAt = new Date().toISOString();
   return {
      schemaVersion: VIDEO_ANALYSIS_SCHEMA_VERSION,
      sessionId: createId('session'),
      createdAt,
      updatedAt: createdAt,
      source: { ...source },
      config: structuredClone(config),
      models: {},
      baseline: null,
      samples: [],
      events: [],
      journal: [],
      editorial: {
         storyOrder: ['baseline'],
         undo: [],
         redo: [],
      },
      status: 'idle',
      summary: {
         sampledFrames: 0,
         mediaPipeFaces: 0,
         faceApiRuns: 0,
         confirmedEvents: 0,
      },
   };
}

/**
 * Appends one structured technical-journal entry.
 *
 * @param {object} session Analysis session.
 * @param {string} type Stable entry type.
 * @param {object} [payload={}] Serializable entry payload.
 * @returns {object} Appended journal entry.
 */
export function appendJournal(session, type, payload = {}) {
   const entry = {
      sequence: session.journal.length + 1,
      recordedAt: new Date().toISOString(),
      type,
      ...structuredClone(payload),
   };
   session.journal.push(entry);
   session.updatedAt = entry.recordedAt;
   return entry;
}

/**
 * Adds one lightweight sample without image pixels or model vectors.
 *
 * @param {object} session Analysis session.
 * @param {object} sample Serializable sample metrics.
 * @returns {object} Stored sample.
 */
export function appendSample(session, sample) {
   const stored = {
      sequence: session.samples.length + 1,
      ...structuredClone(sample),
   };
   session.samples.push(stored);
   session.summary.sampledFrames += 1;
   if (stored.facePresent) session.summary.mediaPipeFaces += 1;
   return stored;
}

/**
 * Adds an evidence event or merges a nearby verification into the latest open
 * event. Images may be attached to the session for report rendering, but they
 * are excluded from the separately downloadable technical log.
 *
 * @param {object} session Analysis session.
 * @param {object} observation Face-api observation and trigger context.
 * @param {number} [mergeWindowSeconds=3] Maximum distance from the previous observation.
 * @returns {object} Created or updated event.
 */
export function recordEvidenceObservation(session, observation, mergeWindowSeconds = 3) {
   const latest = session.events.at(-1);
   const mayMerge = latest
      && latest.status !== 'rejected'
      && observation.mediaTime - latest.endMediaTime <= mergeWindowSeconds;
   const event = mayMerge ? latest : {
      id: createId('event'),
      startMediaTime: observation.mediaTime,
      endMediaTime: observation.mediaTime,
      anchorMediaTime: observation.mediaTime,
      status: 'candidate',
      classification: 'unclassified',
      reviewRequired: true,
      promoted: false,
      caption: '',
      observations: [],
      selectedFrame: null,
      recommendedClip: {
         start: Math.max(0, observation.mediaTime - 2),
         end: observation.mediaTime + 3,
      },
   };

   if (!mayMerge) {
      session.events.push(event);
   }
   event.observations.push(structuredClone(observation));
   event.endMediaTime = observation.mediaTime;
   event.recommendedClip.end = observation.mediaTime + 3;

   const divergent = event.observations.filter((item) => item.outcome === 'divergent');
   if (divergent.length >= 2 && event.status !== 'confirmed') {
      event.status = 'confirmed';
      event.anchorMediaTime = divergent.reduce((best, item) => (
         (item.quality?.sharpness || 0) > (best.quality?.sharpness || 0) ? item : best
      )).mediaTime;
      session.editorial.storyOrder.push(event.id);
      session.editorial.storyOrder.sort((leftId, rightId) => {
         const leftTime = leftId === 'baseline'
            ? session.baseline?.mediaTime ?? Number.POSITIVE_INFINITY
            : session.events.find((candidate) => candidate.id === leftId)?.anchorMediaTime ?? Number.POSITIVE_INFINITY;
         const rightTime = rightId === 'baseline'
            ? session.baseline?.mediaTime ?? Number.POSITIVE_INFINITY
            : session.events.find((candidate) => candidate.id === rightId)?.anchorMediaTime ?? Number.POSITIVE_INFINITY;
         return leftTime - rightTime;
      });
      session.summary.confirmedEvents += 1;
   }
   const distanceDivergences = divergent.filter((item) => (
      Number.isFinite(item.faceDistance)
      && item.faceDistance >= (item.faceThreshold ?? session.config.faceDistanceThreshold)
   ));
   const missingDetections = divergent.filter((item) => item.faceApiDetected === false);
   if (distanceDivergences.length >= 2) {
      event.classification = 'identity-distance';
      event.reviewRequired = false;
   } else if (missingDetections.length >= 2) {
      event.classification = 'detector-divergence';
      event.reviewRequired = true;
   } else if (divergent.length >= 2) {
      event.classification = 'mixed-divergence';
      event.reviewRequired = true;
   }
   return event;
}

/**
 * Attaches or replaces the selected high-resolution frame for an event.
 *
 * @param {object} event Evidence event.
 * @param {{mediaTime: number, dataUrl: string, width: number, height: number, sharpness: number, reason: string}} frame Frame payload.
 * @returns {boolean} Whether the frame replaced the prior selection.
 */
export function selectEventFrame(event, frame) {
   if (event.selectedFrame && event.selectedFrame.sharpness > frame.sharpness) return false;
   event.selectedFrame = { ...frame };
   return true;
}

/**
 * Applies one reversible editorial command.
 *
 * @param {object} session Analysis session.
 * @param {object} command Editorial command.
 * @param {'promote'|'reject'|'caption'|'move-earlier'|'move-later'} command.type Command type.
 * @param {string} command.eventId Event identifier or the reserved `baseline` story item.
 * @param {string} [command.value] Caption value.
 * @returns {boolean} Whether the command changed an event.
 */
export function applyEditorialCommand(session, command) {
   const event = session.events.find((candidate) => candidate.id === command.eventId);
   const isMovement = command.type === 'move-earlier' || command.type === 'move-later';
   if (!event && !(isMovement && command.eventId === 'baseline')) return false;
   const before = {
      event: event ? {
         status: event.status,
         promoted: event.promoted,
         caption: event.caption,
      } : null,
      storyOrder: [...session.editorial.storyOrder],
   };
   if (command.type === 'promote') event.promoted = true;
   if (command.type === 'reject') {
      event.status = 'rejected';
      session.editorial.storyOrder = session.editorial.storyOrder.filter((id) => id !== event.id);
   }
   if (command.type === 'caption') event.caption = command.value || '';
   if (isMovement) {
      const index = session.editorial.storyOrder.indexOf(command.eventId);
      const offset = command.type === 'move-earlier' ? -1 : 1;
      const target = index + offset;
      if (index < 0 || target < 0 || target >= session.editorial.storyOrder.length) return false;
      [session.editorial.storyOrder[index], session.editorial.storyOrder[target]] = [
         session.editorial.storyOrder[target],
         session.editorial.storyOrder[index],
      ];
   }
   const after = {
      event: event ? {
         status: event.status,
         promoted: event.promoted,
         caption: event.caption,
      } : null,
      storyOrder: [...session.editorial.storyOrder],
   };
   session.editorial.undo.push({ command: structuredClone(command), before, after });
   session.editorial.redo = [];
   appendJournal(session, 'editorial-command', { command, before, after });
   return true;
}

/**
 * Restores the state before the latest editorial command.
 *
 * @param {object} session Analysis session.
 * @returns {boolean} Whether a command was undone.
 */
export function undoEditorialCommand(session) {
   const change = session.editorial.undo.pop();
   if (!change) return false;
   const event = session.events.find((candidate) => candidate.id === change.command.eventId);
   if (change.before.event && !event) return false;
   if (event && change.before.event) Object.assign(event, change.before.event);
   session.editorial.storyOrder = [...change.before.storyOrder];
   session.editorial.redo.push(change);
   appendJournal(session, 'editorial-undo', { command: change.command });
   return true;
}

/**
 * Reapplies the latest undone editorial command.
 *
 * @param {object} session Analysis session.
 * @returns {boolean} Whether a command was redone.
 */
export function redoEditorialCommand(session) {
   const change = session.editorial.redo.pop();
   if (!change) return false;
   const event = session.events.find((candidate) => candidate.id === change.command.eventId);
   if (change.after.event && !event) return false;
   if (event && change.after.event) Object.assign(event, change.after.event);
   session.editorial.storyOrder = [...change.after.storyOrder];
   session.editorial.undo.push(change);
   appendJournal(session, 'editorial-redo', { command: change.command });
   return true;
}

/**
 * Produces the user-facing report without technical journal internals or image
 * byte duplication. Selected frame data URLs remain available to the caller as
 * separate frame artifacts.
 *
 * @param {object} session Analysis session.
 * @returns {object} Serializable report model.
 */
export function buildReport(session) {
   const storyIndex = new Map(session.editorial.storyOrder.map((id, index) => [id, index]));
   const events = session.events
      .filter((event) => event.status === 'confirmed' && event.status !== 'rejected')
      .map((event) => ({
         id: event.id,
         startMediaTime: event.startMediaTime,
         endMediaTime: event.endMediaTime,
         anchorMediaTime: event.anchorMediaTime,
         classification: event.classification,
         reviewRequired: event.reviewRequired,
         promoted: event.promoted,
         caption: event.caption,
         recommendedClip: event.recommendedClip,
         selectedFrame: event.selectedFrame ? {
            mediaTime: event.selectedFrame.mediaTime,
            width: event.selectedFrame.width,
            height: event.selectedFrame.height,
            sharpness: event.selectedFrame.sharpness,
            reason: event.selectedFrame.reason,
         } : null,
         evidence: event.observations.map((observation) => ({
            mediaTime: observation.mediaTime,
            outcome: observation.outcome,
            faceDistance: observation.faceDistance,
            visualDrift: observation.visualDrift,
            reasons: observation.reasons,
         })),
      }))
      .sort((left, right) => (
         (storyIndex.get(left.id) ?? Number.POSITIVE_INFINITY)
         - (storyIndex.get(right.id) ?? Number.POSITIVE_INFINITY)
      ));
   const includedIds = new Set(events.map((event) => event.id));
   const storyOrder = session.editorial.storyOrder.filter((id) => id === 'baseline' || includedIds.has(id));

   return {
      schemaVersion: session.schemaVersion,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      source: structuredClone(session.source),
      config: structuredClone(session.config),
      models: structuredClone(session.models),
      storyOrder,
      baseline: session.baseline ? {
         mediaTime: session.baseline.mediaTime,
         faceSpread: session.baseline.faceSpread,
         embeddingMedianDrift: session.baseline.embeddingMedianDrift,
         embeddingMad: session.baseline.embeddingMad,
         visualTriggerThreshold: session.baseline.visualTriggerThreshold,
         frame: session.baseline.frame ? {
            mediaTime: session.baseline.frame.mediaTime,
            width: session.baseline.frame.width,
            height: session.baseline.frame.height,
         } : null,
      } : null,
      summary: structuredClone(session.summary),
      events,
   };
}

/**
 * Serialises the technical log as newline-delimited JSON. The first record is
 * a self-contained header; later records can be streamed or processed without
 * loading report images into memory.
 *
 * @param {object} session Analysis session.
 * @returns {string} NDJSON document ending with a newline.
 */
export function serializeTechnicalLog(session) {
   const header = {
      type: 'analysis-header',
      schemaVersion: session.schemaVersion,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      source: session.source,
      config: session.config,
      models: session.models,
      baseline: session.baseline ? {
         mediaTime: session.baseline.mediaTime,
         faceSpread: session.baseline.faceSpread,
         embeddingMedianDrift: session.baseline.embeddingMedianDrift,
         embeddingMad: session.baseline.embeddingMad,
         visualTriggerThreshold: session.baseline.visualTriggerThreshold,
      } : null,
   };
   const samples = session.samples.map((sample) => ({ type: 'sample', ...sample }));
   const events = session.events.map((event) => ({
      type: 'evidence-event',
      id: event.id,
      startMediaTime: event.startMediaTime,
      endMediaTime: event.endMediaTime,
      anchorMediaTime: event.anchorMediaTime,
      status: event.status,
      classification: event.classification,
      reviewRequired: event.reviewRequired,
      promoted: event.promoted,
      caption: event.caption,
      recommendedClip: event.recommendedClip,
      selectedFrame: event.selectedFrame ? {
         mediaTime: event.selectedFrame.mediaTime,
         width: event.selectedFrame.width,
         height: event.selectedFrame.height,
         sharpness: event.selectedFrame.sharpness,
         reason: event.selectedFrame.reason,
      } : null,
      observations: event.observations,
   }));
   const footer = {
      type: 'analysis-footer',
      status: session.status,
      updatedAt: session.updatedAt,
      summary: session.summary,
      storyOrder: session.editorial.storyOrder,
   };
   return [header, ...samples, ...session.journal, ...events, footer]
      .map((entry) => JSON.stringify(entry))
      .join('\n') + '\n';
}
