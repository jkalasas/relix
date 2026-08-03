import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isApplePlatform,
  isCloseTabShortcut,
  isNewShellShortcut,
} from "@/lib/shortcut-chords";

function keyEvent(
  key: string,
  mods: Partial<
    Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">
  > = {},
): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  } as KeyboardEvent;
}

describe("shortcut chords", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects apple platforms from navigator", () => {
    vi.stubGlobal("navigator", {
      platform: "MacIntel",
      userAgent: "Mozilla",
    });
    expect(isApplePlatform()).toBe(true);

    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "Mozilla",
    });
    expect(isApplePlatform()).toBe(false);
  });

  it("matches Cmd+T / Ctrl+Shift+T for new shell", () => {
    vi.stubGlobal("navigator", {
      platform: "MacIntel",
      userAgent: "Mozilla",
    });
    expect(
      isNewShellShortcut(keyEvent("t", { metaKey: true })),
    ).toBe(true);
    expect(
      isNewShellShortcut(keyEvent("t", { metaKey: true, shiftKey: true })),
    ).toBe(false);

    vi.stubGlobal("navigator", {
      platform: "Win32",
      userAgent: "Mozilla",
    });
    expect(
      isNewShellShortcut(keyEvent("t", { ctrlKey: true, shiftKey: true })),
    ).toBe(true);
    expect(isNewShellShortcut(keyEvent("t", { ctrlKey: true }))).toBe(false);
  });

  it("matches close-tab chords and rejects alt", () => {
    vi.stubGlobal("navigator", {
      platform: "MacIntel",
      userAgent: "Mozilla",
    });
    expect(
      isCloseTabShortcut(keyEvent("w", { metaKey: true })),
    ).toBe(true);
    expect(
      isCloseTabShortcut(keyEvent("w", { metaKey: true, altKey: true })),
    ).toBe(false);
  });
});
