import { describe, expect, it } from "vitest";
import { isViewedNotification } from "@/features/notify/lib/is-viewed";

describe("isViewedNotification", () => {
  it("is viewed when the tab is active in the open workspace and visible", () => {
    expect(
      isViewedNotification({
        tabId: "tab-a",
        workspaceId: "ws-1",
        activeWorkspaceId: "ws-1",
        activeTabId: "tab-a",
        windowVisible: true,
      }),
    ).toBe(true);
  });

  it("is not viewed for a background tab in the same workspace", () => {
    expect(
      isViewedNotification({
        tabId: "tab-b",
        workspaceId: "ws-1",
        activeWorkspaceId: "ws-1",
        activeTabId: "tab-a",
        windowVisible: true,
      }),
    ).toBe(false);
  });

  it("is not viewed for a tab in another workspace", () => {
    expect(
      isViewedNotification({
        tabId: "tab-a",
        workspaceId: "ws-2",
        activeWorkspaceId: "ws-1",
        activeTabId: "tab-a",
        windowVisible: true,
      }),
    ).toBe(false);
  });

  it("is not viewed when the window is blurred or hidden", () => {
    expect(
      isViewedNotification({
        tabId: "tab-a",
        workspaceId: "ws-1",
        activeWorkspaceId: "ws-1",
        activeTabId: "tab-a",
        windowVisible: false,
      }),
    ).toBe(false);
  });

  it("is not viewed without a known workspace or active tab", () => {
    expect(
      isViewedNotification({
        tabId: "tab-a",
        workspaceId: null,
        activeWorkspaceId: "ws-1",
        activeTabId: "tab-a",
        windowVisible: true,
      }),
    ).toBe(false);
    expect(
      isViewedNotification({
        tabId: "tab-a",
        workspaceId: "ws-1",
        activeWorkspaceId: "ws-1",
        activeTabId: null,
        windowVisible: true,
      }),
    ).toBe(false);
  });
});
