import { describe, expect, it, vi } from "vitest";
import { findTabWorkspace, goToTab } from "@/features/notify/lib/go-to-tab";
import type { SessionTab } from "@/features/session-tabs";

const tabs = {
  "h1::adhoc": [
    { id: "shell:a", kind: "shell", shellId: "a" },
    { id: "files", kind: "files" },
  ] as SessionTab[],
};

describe("findTabWorkspace", () => {
  it("finds the workspace holding a tab", () => {
    expect(findTabWorkspace(tabs, "shell:a")).toEqual({
      workspaceId: "h1::adhoc",
      tab: { id: "shell:a", kind: "shell", shellId: "a" },
    });
  });

  it("returns null for unknown tabs", () => {
    expect(findTabWorkspace(tabs, "shell:missing")).toBeNull();
  });
});

describe("goToTab", () => {
  it("opens the workspace and selects shell tabs", () => {
    const navigator = {
      openWorkspace: vi.fn(),
      selectTab: vi.fn(),
      selectShell: vi.fn(),
    };
    expect(goToTab(navigator, tabs, "shell:a")).toBe(true);
    expect(navigator.openWorkspace).toHaveBeenCalledWith("h1", {
      kind: "adhoc",
    });
    expect(navigator.selectTab).toHaveBeenCalledWith("h1::adhoc", "shell:a");
    expect(navigator.selectShell).toHaveBeenCalledWith("h1::adhoc", "h1", "a");
  });

  it("selects tool tabs without touching shells", () => {
    const navigator = {
      openWorkspace: vi.fn(),
      selectTab: vi.fn(),
      selectShell: vi.fn(),
    };
    expect(goToTab(navigator, tabs, "files")).toBe(true);
    expect(navigator.selectShell).not.toHaveBeenCalled();
  });

  it("returns false for unknown tabs", () => {
    const navigator = {
      openWorkspace: vi.fn(),
      selectTab: vi.fn(),
      selectShell: vi.fn(),
    };
    expect(goToTab(navigator, tabs, "shell:missing")).toBe(false);
    expect(navigator.openWorkspace).not.toHaveBeenCalled();
  });
});
