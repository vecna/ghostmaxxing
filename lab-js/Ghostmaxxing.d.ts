/**
 * Ghostmaxxing (Ghostmaxxing) public API declarations for JS plugin authors.
 *
 * This file is intentionally declaration-only (no runtime side effects).
 * Editors like VS Code pick it up automatically to provide autocomplete
 * and hover docs in plain JavaScript files.
 */

/**
 * @source lab-js/utils.js
 */
export interface GhostmaxxingPoint {
  x: number;
  y: number;
}

/**
 * @source lab-js/engine.js
 */
export interface GhostmaxxingFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * @source lab-js/ghostyle3d-uv-renderer.js
 */
export interface GhostmaxxingPaintUvParams {
  landmarks3d?: Array<{ x: number; y: number; z?: number }>;
  values?: Record<string, unknown>;
}

/**
 * @source lab-js/ghostyles-manager.js
 */
export type GhostmaxxingOnDraw = (
  ctx: CanvasRenderingContext2D,
  landmarks: unknown,
  box?: GhostmaxxingFaceBox
) => void;

/**
 * @source lab-js/ghostyles-manager.js
 */
export type GhostmaxxingPaintUV = (
  ctx: CanvasRenderingContext2D,
  params?: GhostmaxxingPaintUvParams,
  helpers?: Record<string, unknown>
) => void;

/**
 * @source lab-js/ghostyles-manager.js
 */
export interface GhostmaxxingPluginModule {
  onInit?: () => string | void;
  onClear?: (ctx: CanvasRenderingContext2D) => void;
  onDraw?: GhostmaxxingOnDraw;
  paintUV?: GhostmaxxingPaintUV;
  params?: Array<{
    name: string;
    label?: string;
    type: 'range' | 'bool' | 'select' | 'color';
    min?: number;
    max?: number;
    step?: number;
    default?: unknown;
    options?: unknown[];
  }>;
}

/**
 * @source lab-js/ghostyles-manager.js
 */
export interface GhostmaxxingPluginRecord {
  id: string;
  name: string;
  url: string;
  version: string | null;
  author: string | null;
  description: string | null;
  releaseDate: string | null;
  module: GhostmaxxingPluginModule;
}

/**
 * @source lab-js/state.js
 */
export interface GhostmaxxingMatchResult {
  [key: string]: unknown;
}

/**
 * @source lab-js/main.js
 */
export interface GhostmaxxingApi {
  /** @source lab-js/utils.js */
  log(message: string, sourcePlugin?: string | null): void;

  /** @source lab-js/main.js */
  clearVisibleLogs(): void;

  /** @source lab-js/utils.js */
  distance(a: number[], b: number[]): number;

  /** @source lab-js/utils.js */
  avgPoint(points: GhostmaxxingPoint[]): GhostmaxxingPoint;

  /** @source lab-js/utils.js */
  lerp(a: GhostmaxxingPoint, b: GhostmaxxingPoint, t: number): GhostmaxxingPoint;

  /** @source lab-js/utils.js */
  scaleFrom(center: GhostmaxxingPoint, point: GhostmaxxingPoint, scale: number): GhostmaxxingPoint;

  /** @source lab-js/utils.js */
  point(x: number, y: number): GhostmaxxingPoint;

  /** @source lab-js/utils.js */
  drawClosedPath(
    ctx: CanvasRenderingContext2D,
    points: GhostmaxxingPoint[],
    fillStyle?: string | null,
    strokeStyle?: string | null,
    lineWidth?: number
  ): void;

  /** @source lab-js/utils.js */
  drawOpenPath(
    ctx: CanvasRenderingContext2D,
    points: GhostmaxxingPoint[],
    strokeStyle: string,
    lineWidth?: number,
    dashed?: boolean
  ): void;

  /** @source lab-js/utils.js */
  drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void;

  /** @source lab-js/utils.js */
  roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void;

  /** @source lab-js/utils.js */
  expandEyePolygon(
    eye: GhostmaxxingPoint[],
    eyebrow: GhostmaxxingPoint[],
    scale?: number,
    eyebrowLift?: number
  ): GhostmaxxingPoint[];

  /** @source lab-js/utils.js */
  drawEyeWing(
    ctx: CanvasRenderingContext2D,
    eye: GhostmaxxingPoint[],
    eyebrow: GhostmaxxingPoint[],
    label: string,
    tone: {
      scale: number;
      brow: number;
      fill: string;
      stroke: string;
      line: string;
      side: 'left' | 'right';
      tailX: number;
      tailY: number;
    }
  ): void;

  /** @source lab-js/utils.js */
  drawCheekSweep(
    ctx: CanvasRenderingContext2D,
    anchor: GhostmaxxingPoint,
    noseSide: GhostmaxxingPoint,
    mouthCorner: GhostmaxxingPoint,
    jawPoint: GhostmaxxingPoint,
    label: string,
    fill: string,
    stroke: string
  ): void;

  /** @source lab-js/utils.js */
  drawContourBand(ctx: CanvasRenderingContext2D, pts: GhostmaxxingPoint[], label: string): void;

  /** @source lab-js/utils.js */
  clipLeftHalf(ctx: CanvasRenderingContext2D, landmarks: unknown): boolean;

  /** @source lab-js/utils.js */
  clipRightHalf(ctx: CanvasRenderingContext2D, landmarks: unknown): boolean;

  /** @source lab-js/utils.js */
  clipLeftHalfUV(ctx: CanvasRenderingContext2D, landmarks3d: unknown): boolean;

  /** @source lab-js/utils.js */
  clipRightHalfUV(ctx: CanvasRenderingContext2D, landmarks3d: unknown): boolean;

  /** @source lab-js/main.js */
  events: EventTarget;

  /** @source lab-js/main.js */
  getDb(): { [key: string]: unknown };

  /** @source lab-js/main.js */
  getDb3d(): { [key: string]: unknown };

  /** @source lab-js/main.js */
  getActiveEffect(): string | null;

  /** @source lab-js/main.js */
  getLastResult(): GhostmaxxingMatchResult | null;

  /** @source lab-js/main.js */
  getMatchThreshold(): number;

  /** @source lab-js/main.js */
  getMatchThreshold3d(): number;

  /** @source lab-js/plugins3d-loader.js */
  getActiveEffect3d(): string | null;

  /** @source lab-js/plugins3d-loader.js */
  activateEffect3d(id: string): boolean;

  /** @source lab-js/plugins3d-loader.js */
  deactivateEffect3d(): boolean;

  /** @source lab-js/plugins3d-loader.js */
  toggleEffect3d(id: string): boolean;

  /** @source lab-js/plugins3d-loader.js */
  reloadPlugins3d(): boolean;

  /** @source lab-js/ghostyles-manager.js */
  reloadPlugins(): Promise<number>;

  /** @source lab-js/main.js */
  lastLandmarks3d: Array<{ x: number; y: number; z?: number }> | null;

  /** @source lab-js/engine.js */
  compositeAndDetect(liveResult: unknown): Promise<unknown>;

  /** @source lab-js/engine-3d.js */
  compositeAndDetect3d(): Promise<unknown>;

  /** @source lab-js/config.js */
  detectorOptions: unknown;

  /** @source lab-js/mediapipe-loop.js */
  FaceLandmarker?: unknown;
}

declare global {
  interface Window {
    Ghostmaxxing: GhostmaxxingApi;
  }
}

export {};
