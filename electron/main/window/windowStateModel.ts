export type WindowState = {
  height: number;
  isMaximized: boolean;
  width: number;
  x?: number;
  y?: number;
};

/** Minimum resizable window. Fits 1366×768 laptops and short viewports; UI scrolls. */
export const minimumWindowSize = {
  width: 900,
  height: 560,
};

export const defaultWindowState: WindowState = {
  width: 1280,
  height: 820,
  isMaximized: false,
};

export function normalizeWindowStateShape(input: unknown): WindowState {
  if (!isRecord(input)) {
    return defaultWindowState;
  }

  const width = normalizeDimension(input.width, defaultWindowState.width, minimumWindowSize.width);
  const height = normalizeDimension(input.height, defaultWindowState.height, minimumWindowSize.height);
  const x = normalizeCoordinate(input.x);
  const y = normalizeCoordinate(input.y);

  return {
    width,
    height,
    isMaximized: input.isMaximized === true,
    ...(typeof x === "number" ? { x } : {}),
    ...(typeof y === "number" ? { y } : {}),
  };
}

function normalizeDimension(input: unknown, fallback: number, minimum: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return fallback;
  }

  return Math.max(minimum, Math.round(input));
}

function normalizeCoordinate(input: unknown): number | undefined {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return undefined;
  }

  return Math.round(input);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
