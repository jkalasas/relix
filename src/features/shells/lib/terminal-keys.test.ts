import { describe, expect, it } from "vitest";
import {
  EMPTY_STICKY_MODS,
  applyStickyToInput,
  encodeSpecialKey,
  hasStickyMods,
} from "@/features/shells/lib/terminal-keys";

describe("sticky mods", () => {
  it("detects any active sticky mod", () => {
    expect(hasStickyMods(EMPTY_STICKY_MODS)).toBe(false);
    expect(hasStickyMods({ ctrl: true, alt: false, shift: false })).toBe(true);
  });

  it("returns input unchanged without mods", () => {
    expect(applyStickyToInput("a", EMPTY_STICKY_MODS)).toBe("a");
    expect(
      applyStickyToInput("", { ctrl: true, alt: false, shift: false }),
    ).toBe("");
  });

  it("applies shift, ctrl, and alt", () => {
    expect(
      applyStickyToInput("a", { ctrl: false, alt: false, shift: true }),
    ).toBe("A");
    expect(
      applyStickyToInput("a", { ctrl: true, alt: false, shift: false }),
    ).toBe("\u0001");
    expect(
      applyStickyToInput("a", { ctrl: false, alt: true, shift: false }),
    ).toBe("\x1ba");
    expect(
      applyStickyToInput("a", { ctrl: true, alt: true, shift: false }),
    ).toBe("\x1b\u0001");
  });
});

describe("encodeSpecialKey", () => {
  it("encodes basic specials", () => {
    expect(encodeSpecialKey("esc")).toBe("\x1b");
    expect(encodeSpecialKey("tab")).toBe("\t");
    expect(
      encodeSpecialKey("tab", { ctrl: false, alt: false, shift: true }),
    ).toBe("\x1b[Z");
  });

  it("encodes arrows with modifier params", () => {
    expect(encodeSpecialKey("up")).toBe("\x1b[A");
    expect(
      encodeSpecialKey("up", { ctrl: false, alt: false, shift: true }),
    ).toBe("\x1b[1;2A");
    expect(
      encodeSpecialKey("right", { ctrl: true, alt: true, shift: false }),
    ).toBe("\x1b[1;7C");
  });
});
