import { describe, expect, it } from "vitest";
import { parseOsc7Cwd } from "@/features/shells/lib/osc7";

describe("parseOsc7Cwd", () => {
  it("returns plain absolute paths", () => {
    expect(parseOsc7Cwd("/home/user/project")).toBe("/home/user/project");
    expect(parseOsc7Cwd("  /tmp  ")).toBe("/tmp");
  });

  it("returns null for empty or non-file URLs", () => {
    expect(parseOsc7Cwd("")).toBeNull();
    expect(parseOsc7Cwd("   ")).toBeNull();
    expect(parseOsc7Cwd("https://example.com/path")).toBeNull();
  });

  it("parses file URLs", () => {
    expect(parseOsc7Cwd("file:///home/user/app")).toBe("/home/user/app");
    expect(parseOsc7Cwd("file://localhost/home/user/app")).toBe(
      "/home/user/app",
    );
    expect(parseOsc7Cwd("file:///tmp/a%20b")).toBe("/tmp/a b");
  });

  it("falls back for non-strict file URLs", () => {
    expect(parseOsc7Cwd("file://host/tmp/space path")).toBe("/tmp/space path");
  });
});
