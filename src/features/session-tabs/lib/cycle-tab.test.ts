import { describe, expect, it } from "vitest";
import type { SessionTab } from "@/features/session-tabs/types";
import { cycleTabId } from "@/features/session-tabs/lib/cycle-tab";

const tabs: SessionTab[] = [
  { id: "shell:a", kind: "shell", shellId: "a" },
  { id: "files", kind: "files" },
  { id: "ports", kind: "ports" },
];

describe("cycleTabId", () => {
  it("returns null when fewer than two tabs", () => {
    expect(cycleTabId([], null, 1)).toBeNull();
    expect(cycleTabId([tabs[0]], tabs[0].id, 1)).toBeNull();
  });

  it("moves forward and wraps", () => {
    expect(cycleTabId(tabs, "shell:a", 1)).toBe("files");
    expect(cycleTabId(tabs, "ports", 1)).toBe("shell:a");
  });

  it("moves backward and wraps", () => {
    expect(cycleTabId(tabs, "files", -1)).toBe("shell:a");
    expect(cycleTabId(tabs, "shell:a", -1)).toBe("ports");
  });

  it("seeds from ends when active is missing", () => {
    expect(cycleTabId(tabs, null, 1)).toBe("shell:a");
    expect(cycleTabId(tabs, "missing", 1)).toBe("shell:a");
    expect(cycleTabId(tabs, null, -1)).toBe("ports");
    expect(cycleTabId(tabs, "missing", -1)).toBe("ports");
  });
});
