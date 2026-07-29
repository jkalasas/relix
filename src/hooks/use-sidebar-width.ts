import { useCallback, useState } from "react";

const STORAGE_KEY = "relix.sidebar-width";
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;

function clampWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(px)));
}

function readStoredWidth(): number {
  if (typeof localStorage === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return clampWidth(parsed);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function writeStoredWidth(px: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    // ignore quota / private mode
  }
}

export function useSidebarWidth() {
  const [widthPx, setWidthPxState] = useState(readStoredWidth);
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
    writeStoredWidth(next);
  }, []);

  return {
    widthPx,
    widthCss: `${widthPx}px`,
    resizing,
    setWidthPx,
    beginResize,
    endResize,
  };
}
