import { describe, expect, it } from "vitest";
import { parseNotifyPayload, parseSseDataLine } from "@/features/notify/lib/parse";

describe("parseNotifyPayload", () => {
  it("accepts minimal payload", () => {
    expect(parseNotifyPayload({ id: "m1", tabId: "shell:abc" })).toEqual({
      id: "m1",
      tabId: "shell:abc",
    });
  });

  it("keeps title and body", () => {
    expect(
      parseNotifyPayload({
        id: "m1",
        tabId: "shell:abc",
        title: "build done",
        body: "ok",
      }),
    ).toEqual({ id: "m1", tabId: "shell:abc", title: "build done", body: "ok" });
  });

  it("rejects empty ids and non-objects", () => {
    expect(parseNotifyPayload({ id: "", tabId: "shell:x" })).toBeNull();
    expect(parseNotifyPayload({ id: "m1", tabId: "" })).toBeNull();
    expect(parseNotifyPayload({ id: "m1" })).toBeNull();
    expect(parseNotifyPayload(null)).toBeNull();
    expect(parseNotifyPayload("m1")).toBeNull();
  });
});

describe("parseSseDataLine", () => {
  it("parses data frames", () => {
    expect(
      parseSseDataLine('data: {"id":"m1","tabId":"shell:abc"}'),
    ).toEqual({ id: "m1", tabId: "shell:abc" });
  });

  it("ignores comments and blanks", () => {
    expect(parseSseDataLine(":ok")).toBeNull();
    expect(parseSseDataLine("")).toBeNull();
    expect(parseSseDataLine("data:")).toBeNull();
    expect(parseSseDataLine("data: not-json")).toBeNull();
  });
});
