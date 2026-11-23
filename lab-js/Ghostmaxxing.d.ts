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
 * @source lab-js/ghostyle-player/preview.js
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
 * @source lab-js/ghostyle-player/catalog.js
 */
export type GhostmaxxingOnDraw = (
  ctx: CanvasRenderingContext2D,
  landmarks: unknown,
  box?: GhostmaxxingFaceBox,
  params?: Record<string, unknown>
) => void;

/**
 * @source lab-js/ghostyle-player/catalog.js
 */
export type GhostmaxxingPaintUV = (
  ctx: CanvasRenderingContext2D,
  params?: GhostmaxxingPaintUvParams,
  helpers?: Record<string, unknown>
) => void;

/**
 * @source lab-js/ghostyle-player/catalog.js
 */
export interface GhostmaxxingPluginModule {
  onInit?: () => string | void;
  onClear?: (ctx: CanvasRenderingContext2D) => void;
  onDraw?: GhostmaxxingOnDraw;
  paintUV?: GhostmaxxingPaintUV;
  /** Restrict UV paint to the face surface around the eyes and inner lip edges. */
  preserveFaceOpenings?: boolean;
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

/** Geometry available from the Player's current camera frame. */
export interface GhostmaxxingFrame {
  detection: { box: GhostmaxxingFaceBox };
  landmarks: { positions: GhostmaxxingPoint[] };
}

/** Public drawing API exposed by Ghostyle Player. */
export interface GhostmaxxingApi {
  /** @source lab-js/utils.js */
  log(message: string, sourcePlugin?: string | null): void;

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
  drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mirrored?: boolean): void;

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

  events: EventTarget;
  getActiveEffect(): string | null;
  getLastResult(): GhostmaxxingFrame | null;
  readonly lastLandmarks3d: (GhostmaxxingPoint & {z?: number})[] | null;
  readonly FaceLandmarker?: unknown;
}

declare global {
  interface Window {
    gstmxx: GhostmaxxingApi;
  }
}

export {};
