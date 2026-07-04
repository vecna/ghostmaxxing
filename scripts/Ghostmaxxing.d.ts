/**
 * Ghostmaxxing (Ghostmaxxing) public API declarations for JS plugin authors.
 *
 * This file is intentionally declaration-only (no runtime side effects).
 * Editors like VS Code pick it up automatically to provide autocomplete
 * and hover docs in plain JavaScript files.
 */

/**
 * @source scripts/utils.js
 */
export interface GhostmaxxingPoint {
  x: number;
  y: number;
}

/**
 * @source scripts/engine.js
 */
export interface GhostmaxxingFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * @source scripts/ghostyle3d-uv-renderer.js
 */
export interface GhostmaxxingPaintUvParams {
  landmarks3d?: Array<{ x: number; y: number; z?: number }>;
  values?: Record<string, unknown>;
}

/**
 * @source scripts/ghostyles-manager.js
 */
export type GhostmaxxingOnDraw = (
  ctx: CanvasRenderingContext2D,
  landmarks: unknown,
  box?: GhostmaxxingFaceBox
) => void;

/**
 * @source scripts/ghostyles-manager.js
 */
export type GhostmaxxingPaintUV = (
  ctx: CanvasRenderingContext2D,
  params?: GhostmaxxingPaintUvParams,
  helpers?: Record<string, unknown>
) => void;

/**
 * @source scripts/ghostyles-manager.js
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
 * @source scripts/ghostyles-manager.js
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
 * @source scripts/state.js
 */
export interface GhostmaxxingMatchResult {
  [key: string]: unknown;
}

/**
 * @source scripts/main.js
 */
export interface GhostmaxxingApi {
  /** @source scripts/utils.js */
  log(message: string, sourcePlugin?: string | null): void;

  /** @source scripts/main.js */
  clearVisibleLogs(): void;

  /** @source scripts/utils.js */
  distance(a: number[], b: number[]): number;

  /** @source scripts/utils.js */
  avgPoint(points: GhostmaxxingPoint[]): GhostmaxxingPoint;

  /** @source scripts/utils.js */
  lerp(a: GhostmaxxingPoint, b: GhostmaxxingPoint, t: number): GhostmaxxingPoint;

  /** @source scripts/utils.js */
  scaleFrom(center: GhostmaxxingPoint, point: GhostmaxxingPoint, scale: number): GhostmaxxingPoint;

  /** @source scripts/utils.js */
  point(x: number, y: number): GhostmaxxingPoint;

  /** @source scripts/utils.js */
  drawClosedPath(
    ctx: CanvasRenderingContext2D,
    points: GhostmaxxingPoint[],
    fillStyle?: string | null,
    strokeStyle?: string | null,
    lineWidth?: number
  ): void;

  /** @source scripts/utils.js */
  drawOpenPath(
    ctx: CanvasRenderingContext2D,
    points: GhostmaxxingPoint[],
    strokeStyle: string,
    lineWidth?: number,
    dashed?: boolean
  ): void;

  /** @source scripts/utils.js */
  drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void;

  /** @source scripts/utils.js */
  roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void;

  /** @source scripts/utils.js */
  expandEyePolygon(
    eye: GhostmaxxingPoint[],
    eyebrow: GhostmaxxingPoint[],
    scale?: number,
    eyebrowLift?: number
  ): GhostmaxxingPoint[];

  /** @source scripts/utils.js */
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

  /** @source scripts/utils.js */
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

  /** @source scripts/utils.js */
  drawContourBand(ctx: CanvasRenderingContext2D, pts: GhostmaxxingPoint[], label: string): void;

  /** @source scripts/utils.js */
  clipLeftHalf(ctx: CanvasRenderingContext2D, landmarks: unknown): boolean;

  /** @source scripts/utils.js */
  clipRightHalf(ctx: CanvasRenderingContext2D, landmarks: unknown): boolean;

  /** @source scripts/utils.js */
  clipLeftHalfUV(ctx: CanvasRenderingContext2D, landmarks3d: unknown): boolean;

  /** @source scripts/utils.js */
  clipRightHalfUV(ctx: CanvasRenderingContext2D, landmarks3d: unknown): boolean;

  /** @source scripts/main.js */
  events: EventTarget;

  /** @source scripts/main.js */
  getDb(): { [key: string]: unknown };

  /** @source scripts/main.js */
  getDb3d(): { [key: string]: unknown };

  /** @source scripts/main.js */
  getActiveEffect(): string | null;

  /** @source scripts/main.js */
  getLastResult(): GhostmaxxingMatchResult | null;

  /** @source scripts/main.js */
  getMatchThreshold(): number;

  /** @source scripts/main.js */
  getMatchThreshold3d(): number;

  /** @source scripts/plugins3d-loader.js */
  getActiveEffect3d(): string | null;

  /** @source scripts/plugins3d-loader.js */
  activateEffect3d(id: string): boolean;

  /** @source scripts/plugins3d-loader.js */
  deactivateEffect3d(): boolean;

  /** @source scripts/plugins3d-loader.js */
  toggleEffect3d(id: string): boolean;

  /** @source scripts/plugins3d-loader.js */
  reloadPlugins3d(): boolean;

  /** @source scripts/ghostyles-manager.js */
  reloadPlugins(): Promise<number>;

  /** @source scripts/main.js */
  lastLandmarks3d: Array<{ x: number; y: number; z?: number }> | null;

  /** @source scripts/engine.js */
  compositeAndDetect(liveResult: unknown): Promise<unknown>;

  /** @source scripts/engine-3d.js */
  compositeAndDetect3d(): Promise<unknown>;

  /** @source scripts/config.js */
  detectorOptions: unknown;

  /** @source scripts/mediapipe-loop.js */
  FaceLandmarker?: unknown;
}

declare global {
  interface Window {
    Ghostmaxxing: GhostmaxxingApi;
  }
}

export {};
