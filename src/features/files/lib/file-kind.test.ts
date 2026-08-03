import { describe, expect, it } from "vitest";
import {
  classifyFile,
  decodeText,
  encodeText,
  extensionOf,
  kindFromName,
  looksLikeText,
  mimeForImage,
} from "@/features/files/lib/file-kind";

describe("extensionOf", () => {
  it("extracts extensions from paths and hidden names", () => {
    expect(extensionOf("dir/file.txt")).toBe("txt");
    expect(extensionOf(".hidden")).toBe("hidden");
    expect(extensionOf(".hidden.txt")).toBe("txt");
    expect(extensionOf("Makefile")).toBe("makefile");
    expect(extensionOf("C:\\win\\path.js")).toBe("js");
  });
});

describe("kindFromName", () => {
  it("maps extensions and special basenames", () => {
    expect(kindFromName("photo.PNG")).toBe("image");
    expect(kindFromName("doc.pdf")).toBe("pdf");
    expect(kindFromName("main.ts")).toBe("text");
    expect(kindFromName("Dockerfile")).toBe("text");
    expect(kindFromName("README")).toBe("text");
    expect(kindFromName("blob.dat")).toBeNull();
  });
});

describe("looksLikeText / classifyFile", () => {
  it("treats empty bytes as text", () => {
    expect(looksLikeText(new Uint8Array())).toBe(true);
  });

  it("rejects null bytes and high control density", () => {
    expect(looksLikeText(new Uint8Array([1, 2, 0, 3]))).toBe(false);
    const controls = new Uint8Array(20).fill(1);
    expect(looksLikeText(controls)).toBe(false);
  });

  it("classifies by name first, then content", () => {
    const textBytes = encodeText("hello");
    const binaryBytes = new Uint8Array([0, 1, 2, 3]);
    expect(classifyFile("readme.md", binaryBytes)).toBe("text");
    expect(classifyFile("photo.png", textBytes)).toBe("image");
    expect(classifyFile("doc.pdf", textBytes)).toBe("pdf");
    expect(classifyFile("unknown.bin", textBytes)).toBe("text");
    expect(classifyFile("unknown.bin", binaryBytes)).toBe("binary");
  });

  it("round-trips text encode/decode", () => {
    const bytes = encodeText("café");
    expect(decodeText(bytes)).toBe("café");
  });
});

describe("mimeForImage", () => {
  it("returns mime types by extension", () => {
    expect(mimeForImage("a.png")).toBe("image/png");
    expect(mimeForImage("a.JPEG")).toBe("image/jpeg");
    expect(mimeForImage("a.svg")).toBe("image/svg+xml");
    expect(mimeForImage("a.bin")).toBe("application/octet-stream");
  });
});
