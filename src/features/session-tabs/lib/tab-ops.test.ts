import { describe, expect, it } from "vitest";
import type { SessionTab } from "@/features/session-tabs/types";
import {
  dropTab,
  neighborId,
  workspaceIdsForHost,
} from "@/features/session-tabs/lib/tab-ops";

const tabs: SessionTab[] = [
  { id: "shell:a", kind: "shell", shellId: "a" },
  { id: "files", kind: "files" },
  { id: "ports", kind: "ports" },
];

describe("neighborId", () => {
  it("prefers the next tab, then previous", () => {
    expect(neighborId(tabs, "shell:a")).toBe("files");
    expect(neighborId(tabs, "ports")).toBe("files");
    expect(neighborId([tabs[0]], "shell:a")).toBeNull();
  });

  it("falls back to first tab when removed id is missing", () => {
    expect(neighborId(tabs, "missing")).toBe("shell:a");
    expect(neighborId([], "missing")).toBeNull();
  });
});

describe("dropTab", () => {
  it("removes a matching tab", () => {
    expect(dropTab(tabs, "files")).toEqual({
      tabs: [tabs[0], tabs[2]],
      removed: tabs[1],
    });
  });

  it("returns null removed when id is missing", () => {
    expect(dropTab(tabs, "missing")).toEqual({
      tabs,
      removed: null,
    });
  });
});

describe("workspaceIdsForHost", () => {
  it("filters map keys for a host", () => {
    const map = {
      "h1::adhoc": 1,
      "h1::project::p1": 2,
      "h2::adhoc": 3,
    };
    expect(workspaceIdsForHost(map, "h1").sort()).toEqual([
      "h1::adhoc",
      "h1::project::p1",
    ]);
    expect(workspaceIdsForHost(map, "missing")).toEqual([]);
  });
});
