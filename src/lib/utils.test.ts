import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and drops falsy values", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("dedupes conflicting tailwind classes via twMerge", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
