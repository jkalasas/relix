import { describe, expect, it } from "vitest";
import {
  basename,
  formatBytes,
  joinFsPath,
  parentPath,
} from "@/features/files/lib/format";

describe("formatBytes", () => {
  it("handles invalid and small sizes", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("scales units", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 2)).toBe("2.0 MB");
    expect(formatBytes(1024 ** 3 * 12)).toBe("12 GB");
  });
});

describe("path helpers", () => {
  it("returns null parent for roots", () => {
    expect(parentPath("/")).toBeNull();
    expect(parentPath("\\")).toBeNull();
    expect(parentPath("C:\\")).toBeNull();
    expect(parentPath("C:")).toBeNull();
    expect(parentPath(".")).toBeNull();
    expect(parentPath("")).toBeNull();
  });

  it("computes parents for unix and windows paths", () => {
    expect(parentPath("/a/b")).toBe("/a");
    expect(parentPath("/a")).toBe("/");
    expect(parentPath("C:\\foo\\bar")).toBe("C:\\foo");
    expect(parentPath("C:\\foo")).toBe("C:\\");
    expect(parentPath("/a/b/")).toBe("/a");
  });

  it("joins paths using the directory separator", () => {
    expect(joinFsPath(".", "file.txt")).toBe("file.txt");
    expect(joinFsPath("", "file.txt")).toBe("file.txt");
    expect(joinFsPath("/a/b", "c")).toBe("/a/b/c");
    expect(joinFsPath("/a/b/", "c")).toBe("/a/b/c");
    expect(joinFsPath("C:\\work", "src")).toBe("C:\\work\\src");
  });

  it("returns basenames", () => {
    expect(basename("/a/b.txt")).toBe("b.txt");
    expect(basename("C:\\foo\\bar")).toBe("bar");
    expect(basename("solo")).toBe("solo");
    expect(basename("/")).toBe("");
  });
});
