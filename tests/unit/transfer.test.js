import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/i18n.js', () => ({
  applyI18n: vi.fn(),
  initI18n: vi.fn(),
  setupLocaleSelect: vi.fn(),
  t: vi.fn((key, params = {}) => {
    if (key === 'transfer_mode_placed') return `Placed using: ${params.mode}`;
    if (key === 'transfer_mode_mesh') return `mesh (${params.count} triangles)`;
    if (Object.keys(params).length) return `${key}:${JSON.stringify(params)}`;
    return key;
  }),
}));

import { initI18n, setupLocaleSelect } from '../../scripts/i18n.js';

function buildTransferDom() {
  document.body.innerHTML = `
    <select id="localeSelect"></select>
    <span id="engineBadge"><span id="engineText"></span></span>
    <div id="stage-before"><span id="hint-before"></span></div>
    <div id="stage-after"><span id="hint-after"></span></div>
    <div id="stage-target"><span id="hint-target"></span></div>
    <p id="note-before"></p>
    <p id="note-after"></p>
    <p id="note-target"></p>
    <input type="file" data-slot="before" />
    <input type="file" data-slot="after" />
    <input type="file" data-slot="target" />
    <input id="thr" value="28" />
    <output id="v-thr">28</output>
    <input id="fth" value="0" />
    <output id="v-fth">0</output>
    <input id="op" value="92" />
    <output id="v-op">92</output>
    <select id="blend"><option value="multiply" selected>Multiply</option><option value="source-over">Normal</option></select>
    <input id="useMesh" type="checkbox" checked />
    <button id="run" disabled></button>
    <button id="download" disabled></button>
    <button id="reset"></button>
    <div id="msg"></div>
    <div id="result"></div>
    <canvas id="matte" width="180" height="180"></canvas>
    <p id="modeNote"></p>
  `;

  for (const id of ['stage-before', 'stage-after', 'stage-target']) {
    document.getElementById(id).getBoundingClientRect = vi.fn(() => ({
      width: 240,
      height: 240,
      left: 0,
      top: 0,
    }));
  }
}

function makeImage(width, height) {
  return { width, height, naturalWidth: width, naturalHeight: height };
}

function installCanvasMocks() {
  const contexts = [];

  class TestImageData {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }

  vi.stubGlobal('ImageData', TestImageData);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,result');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const ctx = {
      canvas: null,
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn((x, y, width, height) => {
        const imageData = new TestImageData(width, height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = 120;
          imageData.data[i + 1] = 80;
          imageData.data[i + 2] = 40;
          imageData.data[i + 3] = 255;
        }
        return imageData;
      }),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      strokeRect: vi.fn(),
      stroke: vi.fn(),
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      lineWidth: 0,
      strokeStyle: '',
    };
    contexts.push(ctx);
    return ctx;
  });

  return contexts;
}

async function importTransfer() {
  vi.resetModules();
  await import('../../scripts/transfer.js');
  return window.GT;
}

describe('transfer page workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildTransferDom();
    installCanvasMocks();
    delete window.faceapi;
    delete window.GT;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete window.GT;
    delete window.faceapi;
  });

  it('bootstraps i18n, exposes GT helpers, and reports box-only engine when face-api is absent', async () => {
    const GT = await importTransfer();

    expect(initI18n).toHaveBeenCalledTimes(1);
    expect(setupLocaleSelect).toHaveBeenCalledWith(document.getElementById('localeSelect'), expect.any(Function));
    expect(GT).toMatchObject({
      load: expect.any(Function),
      setBox: expect.any(Function),
      setParams: expect.any(Function),
      transfer: expect.any(Function),
      resultDataURL: expect.any(Function),
    });
    expect(document.getElementById('engineText').textContent).toBe('transfer_engine_unavailable');
    expect(document.getElementById('result').textContent).toBe('transfer_result_empty');
  });

  it('enables transfer after after/target boxes are set and composites in fallback box mode', async () => {
    const contexts = installCanvasMocks();
    const GT = await importTransfer();

    GT._internal.slots.after.img = makeImage(640, 480);
    GT._internal.slots.target.img = makeImage(1200, 600);
    GT.setBox('after', { x: 100, y: 80, w: 240, h: 240 });
    GT.setBox('target', { x: 300, y: 120, w: 300, h: 300 });
    GT.setParams({ threshold: 28, feather: 0, opacity: 50, blend: 'source-over', useMesh: true });

    expect(document.getElementById('run').disabled).toBe(false);
    expect(document.getElementById('note-after').textContent).toBe('transfer_note_box_set');
    expect(document.getElementById('note-target').textContent).toBe('transfer_note_box_set');

    const mode = await GT.transfer();
    const resultCanvas = document.getElementById('result').querySelector('canvas');

    expect(mode).toBe('transfer_mode_box_unavailable');
    expect(resultCanvas.width).toBe(900);
    expect(resultCanvas.height).toBe(450);
    expect(document.getElementById('download').disabled).toBe(false);
    expect(document.getElementById('msg').textContent).toBe('transfer_msg_done');
    expect(document.getElementById('modeNote').textContent).toBe('Placed using: transfer_mode_box_unavailable');
    expect(GT.resultDataURL()).toBe('data:image/png;base64,result');
    expect(contexts.some((ctx) => ctx.putImageData.mock.calls.length > 0)).toBe(true);
    expect(contexts.some((ctx) => ctx.drawImage.mock.calls.some((call) => call.length === 5))).toBe(true);
  });

  it('resets slots, previews, result, and command state from the reset button', async () => {
    const GT = await importTransfer();
    GT._internal.slots.after.img = makeImage(640, 480);
    GT._internal.slots.target.img = makeImage(640, 480);
    GT.setBox('after', { x: 20, y: 20, w: 100, h: 100 });
    GT.setBox('target', { x: 30, y: 30, w: 100, h: 100 });

    document.getElementById('reset').click();

    expect(GT._internal.slots.after.img).toBeNull();
    expect(GT._internal.slots.after.box).toBeNull();
    expect(GT._internal.slots.target.img).toBeNull();
    expect(document.getElementById('run').disabled).toBe(true);
    expect(document.getElementById('download').disabled).toBe(true);
    expect(document.getElementById('modeNote').textContent).toBe('transfer_mode_not_run');
    expect(document.getElementById('result').textContent).toBe('transfer_result_empty');
  });
});

describe('transfer geometry internals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildTransferDom();
    installCanvasMocks();
    delete window.faceapi;
    delete window.GT;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete window.GT;
  });

  it('triangulates simple point sets and skips degenerate affine warps', async () => {
    const GT = await importTransfer();
    const { triangulate, warpTriangle } = GT._internal;
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }];

    const triangles = triangulate(points);
    expect(triangles.length).toBeGreaterThanOrEqual(2);
    expect(triangles.flat().every((index) => index >= 0 && index < points.length)).toBe(true);

    const ctx = {
      save: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
    };
    const source = document.createElement('canvas');

    warpTriangle(
      ctx,
      source,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 }
    );

    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.setTransform).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
