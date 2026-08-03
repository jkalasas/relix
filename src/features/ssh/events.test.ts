import { describe, expect, it } from "vitest";
import { decodeSshData } from "@/features/ssh/events";

describe("decodeSshData", () => {
  it("decodes base64 into bytes", () => {
    const bytes = decodeSshData(btoa("hi"));
    expect(Array.from(bytes)).toEqual([104, 105]);
  });

  it("decodes empty payload", () => {
    expect(Array.from(decodeSshData(""))).toEqual([]);
  });
});
