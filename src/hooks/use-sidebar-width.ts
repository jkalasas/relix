import { useCallback, useState } from "react";

const STORAGE_KEY = "relix.sidebar-width";
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;

function clampWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(px)));
}

function readStoredWidth(key: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return clampWidth(parsed);
  } catch {
    return fallback;
  }
}

function writeStoredWidth(key: string, px: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(px));
  } catch {
    // ignore quota / private mode
  }
}

export function useSidebarWidth(storageKey: string = STORAGE_KEY, defaultWidth: number = SIDEBAR_DEFAULT_WIDTH) {
  const [widthPx, setWidthPxState] = useState(() => readStoredWidth(storageKey, defaultWidth));
  const [resizing, setResizing] = useState(false);

  const setWidthPx = useCallback((px: number) => {
    setWidthPxState(clampWidth(px));
  }, []);

  const beginResize = useCallback(() => {
    setResizing(true);
  }, []);

  const endResize = useCallback((finalPx: number) => {
    const next = clampWidth(finalPx);
    setWidthPxState(next);
    setResizing(false);
    writeStoredWidth(storageKey, next);
  }, [storageKey]);

  return {
    widthPx,
    widthCss: `${widthPx}px`,
    resizing,
    setWidthPx,
    beginResize,
    endResize,
  };
}
