export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAppChord(
  event: KeyboardEvent,
  key: string,
  options: { requireShiftOnNonApple: boolean },
): boolean {
  if (event.altKey) return false;
  if (event.key.toLowerCase() !== key) return false;

  if (isApplePlatform()) {
    return event.metaKey && !event.ctrlKey && !event.shiftKey;
  }

  if (!event.ctrlKey || event.metaKey) return false;
  return options.requireShiftOnNonApple ? event.shiftKey : !event.shiftKey;
}

export function isNewShellShortcut(event: KeyboardEvent): boolean {
  return isAppChord(event, "t", { requireShiftOnNonApple: true });
}

export function isCloseTabShortcut(event: KeyboardEvent): boolean {
  return isAppChord(event, "w", { requireShiftOnNonApple: true });
}
