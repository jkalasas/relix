export type StickyMods = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

export const EMPTY_STICKY_MODS: StickyMods = {
  ctrl: false,
  alt: false,
  shift: false,
};

export function hasStickyMods(mods: StickyMods): boolean {
  return mods.ctrl || mods.alt || mods.shift;
}

function arrowModifierParam(mods: StickyMods): number {
  return 1 + (mods.shift ? 1 : 0) + (mods.alt ? 2 : 0) + (mods.ctrl ? 4 : 0);
}

function arrowSequence(
  direction: "A" | "B" | "C" | "D",
  mods: StickyMods,
): string {
  const param = arrowModifierParam(mods);
  if (param === 1) return `\x1b[${direction}`;
  return `\x1b[1;${param}${direction}`;
}

function controlChar(char: string): string | null {
  if (char.length !== 1) return null;
  const lower = char.toLowerCase();
  const code = lower.charCodeAt(0);
  if (code >= 97 && code <= 122) {
    return String.fromCharCode(code & 0x1f);
  }
  if (char === " ") return "\0";
  if (char === "@") return "\0";
  if (char === "[") return "\x1b";
  if (char === "\\") return "\x1c";
  if (char === "]") return "\x1d";
  if (char === "^") return "\x1e";
  if (char === "_") return "\x1f";
  if (char === "?") return "\x7f";
  return null;
}

export function applyStickyToInput(data: string, mods: StickyMods): string {
  if (!hasStickyMods(mods) || data.length === 0) return data;

  let result = data;

  if (mods.shift && result.length === 1) {
    const upper = result.toUpperCase();
    if (upper !== result.toLowerCase()) {
      result = upper;
    }
  }

  if (mods.ctrl) {
    if (result === "\t") {
      result = "\t";
    } else if (result === "\r" || result === "\n") {
      result = "\n";
    } else {
      const ctrl = controlChar(result);
      if (ctrl != null) result = ctrl;
    }
  }

  if (mods.alt) {
    result = `\x1b${result}`;
  }

  return result;
}

export type TerminalSpecialKey =
  | "esc"
  | "tab"
  | "up"
  | "down"
  | "left"
  | "right";

export function encodeSpecialKey(
  key: TerminalSpecialKey,
  mods: StickyMods = EMPTY_STICKY_MODS,
): string {
  switch (key) {
    case "esc":
      return "\x1b";
    case "tab":
      return mods.shift ? "\x1b[Z" : "\t";
    case "up":
      return arrowSequence("A", mods);
    case "down":
      return arrowSequence("B", mods);
    case "right":
      return arrowSequence("C", mods);
    case "left":
      return arrowSequence("D", mods);
  }
}
