import { describe, expect, it } from "vitest";
import {
  CLIPBOARD_DIR,
  basenameOf,
  sanitizeExtension,
  stagedFileName,
  stagedRemotePath,
} from "@/features/clipboard/lib/clipboard-names";
import { formatTransferBytes } from "@/features/clipboard/lib/format-bytes";
import { quoteShellPath } from "@/features/clipboard/lib/quote-path";

describe("basenameOf", () => {
  it("takes the final segment of posix and windows paths", () => {
    expect(basenameOf("/tmp/photo.png")).toBe("photo.png");
    expect(basenameOf("C:\\Users\\u\\photo.png")).toBe("photo.png");
    expect(basenameOf("photo.png")).toBe("photo.png");
  });
});

describe("sanitizeExtension", () => {
  it("keeps simple lowercase extensions", () => {
    expect(sanitizeExtension("photo.png")).toBe("png");
    expect(sanitizeExtension("archive.TAR.GZ")).toBe("gz");
  });

  it("rejects missing or unsafe extensions", () => {
    expect(sanitizeExtension("Makefile")).toBe("");
    expect(sanitizeExtension("file.")).toBe("");
    expect(sanitizeExtension("evil.sh;rm")).toBe("");
    expect(sanitizeExtension("long.abcdefghij")).toBe("");
  });
});

describe("stagedFileName", () => {
  it("preserves the file type with a unique base", () => {
    const first = stagedFileName("photo.png");
    const second = stagedFileName("photo.png");
    expect(first).not.toBe(second);
    expect(first.endsWith(".png")).toBe(true);
    expect(stagedFileName("Makefile")).not.toContain(".");
  });

  it("stays inside the clipboard dir", () => {
    expect(stagedRemotePath("a.png").startsWith(`${CLIPBOARD_DIR}/`)).toBe(true);
  });
});

describe("quoteShellPath", () => {
  it("single-quotes paths and escapes embedded quotes", () => {
    expect(quoteShellPath("/tmp/a b.png")).toBe("'/tmp/a b.png'");
    expect(quoteShellPath("/tmp/o'clock.png")).toBe("'/tmp/o'\"'\"'clock.png'");
  });
});

describe("formatTransferBytes", () => {
  it("scales through units", () => {
    expect(formatTransferBytes(0)).toBe("0 B");
    expect(formatTransferBytes(512)).toBe("512 B");
    expect(formatTransferBytes(1536)).toBe("1.5 KB");
    expect(formatTransferBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});
