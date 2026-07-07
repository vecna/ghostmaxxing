import { vi } from 'vitest';

// 1. Mock localStorage first before everything else to avoid JSDOM opaque origin SecurityError
const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, value) => { store[key] = String(value); }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  length: 0,
  key: vi.fn((index) => Object.keys(store)[index] || null)
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
});
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
});

// Mock sessionStorage as well
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
});

// 2. Setup the DOM structure before scripts evaluate
document.body.innerHTML = `
  <div class="viewer fullscreen" id="viewer">
    <span id="statusDot"></span><span id="statusText"></span>
    <div id="placeholder"></div>
    <video id="video"></video>
    <img id="previewImage" />
    <canvas id="overlay"></canvas>
    <canvas id="mesh3dOverlay"></canvas>
    <canvas id="bboxOverlay"></canvas>
  </div>
  <button id="scanBtn"></button>
  <button id="copyMakeupBtn"></button>
  <button id="fullscreenBtn"></button>
  <button id="toggleSettingsBtn"></button>
  <button id="closeSettingsBtn"></button>
  <div id="settingsDrawer" class="settings-drawer hidden"></div>
  <div id="historyDrawer" class="settings-drawer hidden"></div>
  <div id="historyEntries"></div>
  <button id="saveBtn"></button>
  <button id="analyzeBtn"></button>
  <button id="recordBtn"></button>
  <button id="overlayModeBtn">Vista: bbox</button>
  <span id="dbCountBadge"></span>
  <button id="clearDbBtn"></button>
  <button id="reloadPluginsBtn" style="display:none"></button>
  <button id="switchCameraBtn"></button>
  <div id="logBox"></div>
  <div id="dbCount"></div>
  <div id="nextId"></div>
  <div id="thresholdLabel"></div>
  <div id="effectName"></div>
  <div id="effectTracking"></div>
  <div id="ghostylesContainer"></div>
  <button id="mirrorToggle"></button>
  <select id="fpsSelect"><option value="120" selected></option></select>
`;

// 3. Define canvas prototype mock
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  fillRect: vi.fn(),
  measureText: vi.fn(() => ({ width: 10 })),
  fillText: vi.fn(),
  arc: vi.fn(),
  setLineDash: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  arcTo: vi.fn(),
  drawImage: vi.fn()
}));

// 4. Mock faceapi
window.faceapi = {
  TinyFaceDetectorOptions: vi.fn(),
  nets: {
    tinyFaceDetector: { loadFromUri: vi.fn(() => Promise.resolve()) },
    faceLandmark68Net: { loadFromUri: vi.fn(() => Promise.resolve()) },
    faceRecognitionNet: { loadFromUri: vi.fn(() => Promise.resolve()) },
    ageGenderNet: { loadFromUri: vi.fn(() => Promise.resolve()) },
    faceExpressionNet: { loadFromUri: vi.fn(() => Promise.resolve()) }
  },
  detectSingleFace: vi.fn(() => ({
    withFaceLandmarks: vi.fn(() => ({
      withAgeAndGender: vi.fn(() => ({
        withFaceDescriptor: vi.fn()
      }))
    }))
  })),
  resizeResults: vi.fn((res) => res),
};
