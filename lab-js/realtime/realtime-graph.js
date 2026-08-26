/**
 * @module realtime-graph
 * @description
 * The left column: a scrollable distance plot with a FIXED time scale.
 *
 * Two things here are load-bearing and easy to undo by accident.
 *
 * 1. FIXED SCALE. The prototype stretched whatever history it had across the
 *    full canvas height, so ten points and two hundred points both filled the
 *    panel and a trace's steepness meant nothing. Every sample now occupies
 *    the same number of pixels. The visible window is 60 seconds, always.
 *
 * 2. COLLAPSED GAPS. An absence is drawn as a fixed-height break labelled with
 *    its real duration, not as a proportional stretch of empty axis. The
 *    working session is: measure, walk to the mirror, apply makeup for eight
 *    minutes, come back. Drawn to scale that is ~5,700px of nothing wedged
 *    between the two measurements you are actually trying to compare. The
 *    elapsed time is not lost, it just isn't spatialised.
 *
 * Rendering is virtualised: the canvas is sticky and sized to the scroll
 * viewport, a spacer supplies the scroll height, and only the visible slice is
 * drawn. Memory is constant, so session length is unbounded. Growing one tall
 * canvas instead would hit the ~32k px dimension cap after ~45 minutes and
 * hold ~30MB on the way there.
 */

const GAP_BLOCK_PX = 30;
const AXIS_STRIP_PX = 17;
const PAD_LEFT = 6;
const GUTTER_RIGHT = 24;
const MARKER_RADIUS = 7;
const FOLLOW_SLACK_PX = 10;

/**
 * Formats a duration in milliseconds as a compact human string.
 *
 * @param {number} ms Duration in milliseconds.
 * @returns {string} Compact duration such as "8m 12s" or "4s".
 */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Formats a timestamp as a zero-padded wall clock label.
 *
 * @param {number} timestamp Epoch milliseconds.
 * @returns {string} Clock label such as "14:32:07".
 */
function formatClock(timestamp) {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Reads a resolved CSS custom property from an element with a fallback.
 *
 * @param {Element} el Element whose computed style is read.
 * @param {string} name Custom property name including leading dashes.
 * @param {string} fallback Value used when the property resolves empty.
 * @returns {string} Resolved colour string.
 */
function token(el, name, fallback) {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Creates the virtualised distance graph controller.
 *
 * @param {object} options Wiring and tuning options.
 * @param {HTMLElement} options.scrollEl Scroll container element.
 * @param {HTMLElement} options.spacerEl Spacer element supplying scroll height.
 * @param {HTMLCanvasElement} options.canvasEl Sticky canvas element.
 * @param {HTMLElement} options.followEl "Jump to now" button.
 * @param {number} options.windowSeconds Seconds visible in one viewport.
 * @param {number} options.samplesPerSecond Sample cadence used for layout.
 * @param {number} options.maxDistance Right edge of the distance axis.
 * @param {number} options.threshold Cited match threshold line.
 * @param {(captureId: string) => void} options.onMarkerClick Marker click handler.
 * @returns {object} Graph controller.
 */
export function createGraph(options) {
  const {
    scrollEl,
    spacerEl,
    canvasEl,
    followEl,
    windowSeconds,
    samplesPerSecond,
    maxDistance,
    threshold,
    onMarkerClick,
  } = options;

  const ctx = canvasEl.getContext('2d');

  /** @type {Array<{kind: string, t: number, value?: number, endT?: number, seq?: number, captureId?: string}>} */
  let entries = [];
  /** @type {number[]} Virtual top offset of each entry, in CSS pixels. */
  let tops = [];
  let contentHeight = 0;
  let sampleSeq = 0;
  let openGapIndex = -1;

  let noiseFloor = null;
  let follow = true;
  let programmaticScroll = false;

  let viewportH = 0;
  let viewportW = 0;
  let pxPerSample = 4;
  let labelEvery = samplesPerSecond * 10;

  /**
   * Height in CSS pixels contributed by one timeline entry.
   *
   * @param {object} entry Timeline entry.
   * @returns {number} Entry height.
   */
  function entryHeight(entry) {
    return entry.kind === 'gap' ? GAP_BLOCK_PX : pxPerSample;
  }

  /**
   * Rebuilds cumulative offsets. O(n), called only on resize.
   *
   * @returns {void}
   */
  function relayout() {
    tops = new Array(entries.length);
    let acc = 0;
    for (let i = 0; i < entries.length; i += 1) {
      tops[i] = acc;
      acc += entryHeight(entries[i]);
    }
    contentHeight = acc;
    syncSpacer();
  }

  /**
   * Applies the current virtual height to the scroll spacer.
   *
   * @returns {void}
   */
  function syncSpacer() {
    spacerEl.style.height = `${Math.round(Math.max(contentHeight, viewportH))}px`;
  }

  /**
   * Scrolls to the live edge without tripping the follow-disengage handler.
   *
   * @returns {void}
   */
  function scrollToNow() {
    programmaticScroll = true;
    scrollEl.scrollTop = scrollEl.scrollHeight;
    window.requestAnimationFrame(() => {
      programmaticScroll = false;
    });
  }

  /**
   * Shows or hides the "Jump to now" affordance.
   *
   * @returns {void}
   */
  function syncFollowButton() {
    followEl.hidden = follow;
  }

  /**
   * Binary search for the last entry whose top is at or above a virtual y.
   *
   * @param {number} y Virtual y offset in CSS pixels.
   * @returns {number} Index of the entry containing y.
   */
  function indexAt(y) {
    let lo = 0;
    let hi = tops.length - 1;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid] <= y) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  /**
   * Maps a distance value to a canvas x coordinate, clamped to the axis.
   *
   * @param {number} value Distance value.
   * @returns {number} Canvas x in CSS pixels.
   */
  function xFor(value) {
    const plotWidth = viewportW - PAD_LEFT - GUTTER_RIGHT;
    const normalized = Math.max(0, Math.min(1, value / maxDistance));
    return PAD_LEFT + normalized * plotWidth;
  }

  /**
   * Repaints the visible slice of the timeline.
   *
   * @returns {void}
   */
  function draw() {
    if (!ctx || viewportW <= 0 || viewportH <= 0) return;

    const colors = {
      plotBg: token(canvasEl, '--rt-plot-bg', '#2c2318'),
      trace: token(canvasEl, '--rt-trace', '#ffe7a8'),
      thresholdLine: token(canvasEl, '--rt-threshold', '#f3c747'),
      noise: token(canvasEl, '--rt-noise', '#7fe3b0'),
      grid: token(canvasEl, '--rt-grid', 'rgba(255,231,168,0.08)'),
      gap: token(canvasEl, '--rt-gap', '#8a7b6a'),
      faint: token(canvasEl, '--rt-gap', '#8a7b6a'),
    };

    const scrollTop = scrollEl.scrollTop;
    const plotWidth = viewportW - PAD_LEFT - GUTTER_RIGHT;

    ctx.clearRect(0, 0, viewportW, viewportH);
    ctx.fillStyle = colors.plotBg;
    ctx.fillRect(0, 0, viewportW, viewportH);

    // Axis ticks. These carry no claim; they exist so a value can be read off
    // the trace. Kept at hairline weight so they never compete with the two
    // reference lines below, which do carry claims.
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (const value of [0.25, 0.5, 0.75, 1.0, 1.25]) {
      if (value > maxDistance) continue;
      const x = Math.round(xFor(value)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, viewportH);
      ctx.stroke();
    }

    if (noiseFloor !== null) {
      const x = Math.round(xFor(noiseFloor)) + 0.5;
      ctx.strokeStyle = colors.noise;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, viewportH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const thresholdX = Math.round(xFor(threshold)) + 0.5;
    ctx.strokeStyle = colors.thresholdLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(thresholdX, 0);
    ctx.lineTo(thresholdX, viewportH);
    ctx.stroke();

    if (entries.length) {
      const firstIndex = indexAt(Math.max(0, scrollTop - GAP_BLOCK_PX));
      const limit = scrollTop + viewportH;

      ctx.lineWidth = 2;
      ctx.strokeStyle = colors.trace;
      ctx.lineJoin = 'round';

      let penDown = false;
      ctx.beginPath();

      for (let i = firstIndex; i < entries.length; i += 1) {
        const top = tops[i];
        if (top > limit) break;
        const entry = entries[i];
        const y = top - scrollTop;

        if (entry.kind === 'gap') {
          if (penDown) {
            ctx.stroke();
            ctx.beginPath();
            penDown = false;
          }
          drawGap(entry, y, colors, plotWidth);
          continue;
        }

        const x = xFor(entry.value);
        const yMid = y + pxPerSample / 2;
        if (!penDown) {
          ctx.moveTo(x, yMid);
          penDown = true;
        } else {
          ctx.lineTo(x, yMid);
        }

        if (entry.value > maxDistance) {
          ctx.stroke();
          drawOverflow(yMid, colors.trace);
          ctx.beginPath();
          ctx.moveTo(x, yMid);
        }
      }

      if (penDown) ctx.stroke();

      // Second pass so markers and labels sit above the trace.
      for (let i = firstIndex; i < entries.length; i += 1) {
        const top = tops[i];
        if (top > limit) break;
        const entry = entries[i];
        if (entry.kind !== 'sample') continue;
        const yMid = top - scrollTop + pxPerSample / 2;

        if (entry.seq % labelEvery === 0) {
          ctx.fillStyle = colors.faint;
          ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(formatClock(entry.t), PAD_LEFT + 2, yMid);
        }

        if (entry.captureId) drawMarker(yMid, colors);
      }
    }

    drawAxisStrip(colors);
  }

  /**
   * Draws a collapsed absence block with its true duration.
   *
   * @param {object} entry Gap entry.
   * @param {number} y Canvas y of the block top.
   * @param {object} colors Resolved palette.
   * @param {number} plotWidth Usable plot width in CSS pixels.
   * @returns {void}
   */
  function drawGap(entry, y, colors, plotWidth) {
    const endT = entry.endT ?? Date.now();
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD_LEFT, y, plotWidth, GAP_BLOCK_PX);
    ctx.clip();

    ctx.strokeStyle = colors.gap;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 1;
    for (let hx = -GAP_BLOCK_PX; hx < plotWidth + GAP_BLOCK_PX; hx += 7) {
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT + hx, y + GAP_BLOCK_PX);
      ctx.lineTo(PAD_LEFT + hx + GAP_BLOCK_PX, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = colors.gap;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, Math.round(y) + 0.5);
    ctx.lineTo(PAD_LEFT + plotWidth, Math.round(y) + 0.5);
    ctx.moveTo(PAD_LEFT, Math.round(y + GAP_BLOCK_PX) + 0.5);
    ctx.lineTo(PAD_LEFT + plotWidth, Math.round(y + GAP_BLOCK_PX) + 0.5);
    ctx.stroke();

    const label = `no face · ${formatDuration(endT - entry.t)}`;
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(label);
    const cx = PAD_LEFT + plotWidth / 2;
    const cy = y + GAP_BLOCK_PX / 2;

    ctx.fillStyle = token(canvasEl, '--rt-plot-bg', '#2c2318');
    ctx.fillRect(cx - metrics.width / 2 - 5, cy - 7, metrics.width + 10, 14);
    ctx.fillStyle = colors.gap;
    ctx.fillText(label, cx, cy);
  }

  /**
   * Draws the off-axis indicator for a sample beyond the plotted ceiling.
   *
   * @param {number} y Canvas y of the sample.
   * @param {string} color Trace colour.
   * @returns {void}
   */
  function drawOverflow(y, color) {
    const x = viewportW - GUTTER_RIGHT;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 3.5);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 3.5);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draws a saved-capture marker in the right gutter with a connector.
   *
   * @param {number} y Canvas y of the marked sample.
   * @param {object} colors Resolved palette.
   * @returns {void}
   */
  function drawMarker(y, colors) {
    const cx = viewportW - GUTTER_RIGHT / 2;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(viewportW - GUTTER_RIGHT, y);
    ctx.lineTo(cx - MARKER_RADIUS, y);
    ctx.stroke();

    ctx.fillStyle = token(canvasEl, '--rt-plot-bg', '#2c2318');
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(cx, y, MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors.trace;
    ctx.fillRect(cx - 3.5, y - 2, 7, 4.5);
    ctx.fillStyle = token(canvasEl, '--rt-plot-bg', '#2c2318');
    ctx.beginPath();
    ctx.arc(cx, y + 0.25, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draws the pinned scale strip. The canvas is sticky, so anything painted at
   * fixed canvas coordinates behaves as a fixed overlay while content scrolls.
   *
   * @param {object} colors Resolved palette.
   * @returns {void}
   */
  function drawAxisStrip(colors) {
    ctx.fillStyle = token(canvasEl, '--rt-surface-solid', 'rgba(12,9,6,0.86)');
    ctx.fillRect(0, 0, viewportW, AXIS_STRIP_PX);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, AXIS_STRIP_PX + 0.5);
    ctx.lineTo(viewportW, AXIS_STRIP_PX + 0.5);
    ctx.stroke();

    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.faint;

    const ticks = [0, 0.5, 1.0];
    for (const value of ticks) {
      if (value > maxDistance) continue;
      const x = xFor(value);
      ctx.textAlign = value === 0 ? 'left' : 'center';
      ctx.fillText(value.toFixed(1), x, AXIS_STRIP_PX / 2);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = colors.thresholdLine;
    ctx.fillText('0.6', xFor(threshold), AXIS_STRIP_PX / 2);
  }

  /**
   * Recomputes canvas backing store and layout for the current viewport.
   *
   * @returns {void}
   */
  function resize() {
    const rect = scrollEl.getBoundingClientRect();
    const nextW = Math.max(Math.floor(rect.width), 1);
    const nextH = Math.max(Math.floor(rect.height), 1);
    const dpr = Math.max(window.devicePixelRatio || 1, 1);

    viewportW = nextW;
    viewportH = nextH;
    pxPerSample = viewportH / (windowSeconds * samplesPerSecond);
    labelEvery = samplesPerSecond * 10;

    canvasEl.style.height = `${nextH}px`;
    canvasEl.width = Math.floor(nextW * dpr);
    canvasEl.height = Math.floor(nextH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    relayout();
    if (follow) scrollToNow();
    draw();
  }

  /**
   * Appends one measured sample at the live edge.
   *
   * @param {number} t Epoch milliseconds of the sample.
   * @param {number} value Averaged distance for the tick.
   * @returns {number} Index of the appended entry.
   */
  function pushSample(t, value) {
    openGapIndex = -1;
    const entry = { kind: 'sample', t, value, seq: sampleSeq };
    sampleSeq += 1;
    tops.push(contentHeight);
    entries.push(entry);
    contentHeight += pxPerSample;
    syncSpacer();
    if (follow) scrollToNow();
    draw();
    return entries.length - 1;
  }

  /**
   * Opens an absence block, or extends the one already open.
   *
   * @param {number} t Epoch milliseconds when the face was last seen.
   * @returns {void}
   */
  function beginGap(t) {
    if (openGapIndex !== -1) {
      draw();
      return;
    }
    const entry = { kind: 'gap', t, endT: null };
    tops.push(contentHeight);
    entries.push(entry);
    contentHeight += GAP_BLOCK_PX;
    openGapIndex = entries.length - 1;
    syncSpacer();
    if (follow) scrollToNow();
    draw();
  }

  /**
   * Closes the open absence block.
   *
   * @param {number} t Epoch milliseconds when the face returned.
   * @returns {void}
   */
  function endGap(t) {
    if (openGapIndex === -1) return;
    entries[openGapIndex].endT = t;
    openGapIndex = -1;
    draw();
  }

  /**
   * Attaches a saved capture to the most recent sample.
   *
   * @param {string} captureId Identifier of the stored capture.
   * @returns {void}
   */
  function markLatestCapture(captureId) {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].kind === 'sample') {
        entries[i].captureId = captureId;
        draw();
        return;
      }
    }
  }

  /**
   * Removes a capture marker after the capture is deleted.
   *
   * @param {string} captureId Identifier of the removed capture.
   * @returns {void}
   */
  function clearCapture(captureId) {
    for (const entry of entries) {
      if (entry.captureId === captureId) delete entry.captureId;
    }
    draw();
  }

  /**
   * Sets the measured noise floor drawn as the lower reference line.
   *
   * @param {number|null} value Measured noise floor, or null to hide it.
   * @returns {void}
   */
  function setNoiseFloor(value) {
    noiseFloor = value;
    draw();
  }

  /**
   * Clears the timeline and returns to the live edge.
   *
   * @returns {void}
   */
  function reset() {
    entries = [];
    tops = [];
    contentHeight = 0;
    sampleSeq = 0;
    openGapIndex = -1;
    follow = true;
    syncFollowButton();
    syncSpacer();
    scrollToNow();
    draw();
  }

  /**
   * Resolves a pointer event to a capture marker, if one was hit.
   *
   * @param {PointerEvent|MouseEvent} event Pointer event on the canvas.
   * @returns {string|null} Capture id, or null when nothing was hit.
   */
  function markerAt(event) {
    const rect = canvasEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < viewportW - GUTTER_RIGHT - MARKER_RADIUS) return null;

    const virtualY = scrollEl.scrollTop + (event.clientY - rect.top);
    const index = indexAt(virtualY);

    for (let i = Math.max(0, index - 3); i <= Math.min(entries.length - 1, index + 3); i += 1) {
      const entry = entries[i];
      if (entry.kind !== 'sample' || !entry.captureId) continue;
      const centre = tops[i] + pxPerSample / 2;
      if (Math.abs(centre - virtualY) <= MARKER_RADIUS + 3) return entry.captureId;
    }
    return null;
  }

  scrollEl.addEventListener('scroll', () => {
    if (programmaticScroll) {
      draw();
      return;
    }
    const distanceFromBottom =
      scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    follow = distanceFromBottom <= FOLLOW_SLACK_PX;
    syncFollowButton();
    draw();
  });

  canvasEl.addEventListener('click', (event) => {
    const captureId = markerAt(event);
    if (captureId && typeof onMarkerClick === 'function') onMarkerClick(captureId);
  });

  canvasEl.addEventListener('pointermove', (event) => {
    canvasEl.classList.toggle('is-clickable', Boolean(markerAt(event)));
  });

  followEl.addEventListener('click', () => {
    follow = true;
    syncFollowButton();
    scrollToNow();
    draw();
  });

  const observer = new ResizeObserver(() => resize());
  observer.observe(scrollEl);

  return {
    resize,
    draw,
    reset,
    pushSample,
    beginGap,
    endGap,
    markLatestCapture,
    clearCapture,
    setNoiseFloor,
    /**
     * Reports timeline size for diagnostics and tests.
     *
     * @returns {{samples: number, gaps: number, following: boolean}} Snapshot.
     */
    stats() {
      let samples = 0;
      let gaps = 0;
      for (const entry of entries) {
        if (entry.kind === 'gap') gaps += 1;
        else samples += 1;
      }
      return { samples, gaps, following: follow };
    },
    /**
     * Disconnects observers held by the graph.
     *
     * @returns {void}
     */
    destroy() {
      observer.disconnect();
    },
  };
}
