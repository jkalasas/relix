const STORAGE_KEY = "relix.terminal.fontSize";
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const MIN_TERMINAL_FONT_SIZE = 10;
export const MAX_TERMINAL_FONT_SIZE = 28;
export const TERMINAL_FONT_STEP = 1;

const listeners = new Set<(size: number) => void>();

function clampFontSize(size: number): number {
  return Math.min(
    MAX_TERMINAL_FONT_SIZE,
    Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(size)),
  );
}

function readStoredFontSize(): number {
  if (typeof localStorage === "undefined") return DEFAULT_TERMINAL_FONT_SIZE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_TERMINAL_FONT_SIZE;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_TERMINAL_FONT_SIZE;
    return clampFontSize(parsed);
  } catch {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
}

function writeStoredFontSize(size: number) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // ignore quota / private mode
  }
}

let fontSize = readStoredFontSize();

function notify() {
  for (const listener of listeners) listener(fontSize);
}

export function getTerminalFontSize(): number {
  return fontSize;
}

export function setTerminalFontSize(size: number): number {
  const next = clampFontSize(size);
  if (next === fontSize) return fontSize;
  fontSize = next;
  writeStoredFontSize(fontSize);
  notify();
  return fontSize;
}

export function adjustTerminalFontSize(delta: number): number {
  return setTerminalFontSize(fontSize + delta);
}

export function resetTerminalFontSize(): number {
  return setTerminalFontSize(DEFAULT_TERMINAL_FONT_SIZE);
}

export function subscribeTerminalFontSize(
  listener: (size: number) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
