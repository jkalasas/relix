import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionTabs } from "@/features/session-tabs/hooks/use-session-tabs";
import { fileTabId, shellTabId } from "@/features/session-tabs/types";

vi.mock("@/features/files", async () => {
  const actual = await vi.importActual<typeof import("@/features/files")>(
    "@/features/files",
  );
  return {
    ...actual,
    openFile: vi.fn(),
    saveText: vi.fn(),
    downloadFile: vi.fn(),
  };
});

import { openFile } from "@/features/files";

const workspaceId = "h1::adhoc";
const hostId = "h1";

describe("useSessionTabs", () => {
  beforeEach(() => {
    vi.mocked(openFile).mockReset();
  });

  it("opens tool tabs and activates them", () => {
    const { result } = renderHook(() => useSessionTabs());

    act(() => {
      result.current.openToolTab(workspaceId, "files");
    });

    expect(result.current.tabsByWorkspace[workspaceId]).toEqual([
      { id: "files", kind: "files" },
    ]);
    expect(result.current.activeTabByWorkspace[workspaceId]).toBe("files");

    act(() => {
      result.current.openToolTab(workspaceId, "ports");
    });
    act(() => {
      result.current.openToolTab(workspaceId, "files");
    });

    expect(
      result.current.tabsByWorkspace[workspaceId]?.map((tab) => tab.id),
    ).toEqual(["files", "ports"]);
    expect(result.current.activeTabByWorkspace[workspaceId]).toBe("files");
  });

  it("syncs shell tabs and falls back when active shell disappears", () => {
    const { result } = renderHook(() => useSessionTabs());

    act(() => {
      result.current.syncShellTabs(workspaceId, ["a", "b"]);
    });

    expect(result.current.tabsByWorkspace[workspaceId]).toEqual([
      { id: shellTabId("a"), kind: "shell", shellId: "a" },
      { id: shellTabId("b"), kind: "shell", shellId: "b" },
    ]);
    expect(result.current.activeTabByWorkspace[workspaceId]).toBe(
      shellTabId("a"),
    );

    act(() => {
      result.current.selectTab(workspaceId, shellTabId("b"));
      result.current.syncShellTabs(workspaceId, ["a"]);
    });

    expect(result.current.tabsByWorkspace[workspaceId]).toEqual([
      { id: shellTabId("a"), kind: "shell", shellId: "a" },
    ]);
    expect(result.current.activeTabByWorkspace[workspaceId]).toBe(
      shellTabId("a"),
    );
  });

  it("closes tabs and moves active to a neighbor", () => {
    const { result } = renderHook(() => useSessionTabs());

    act(() => {
      result.current.syncShellTabs(workspaceId, ["a", "b"]);
      result.current.openToolTab(workspaceId, "files");
      result.current.selectTab(workspaceId, shellTabId("a"));
    });

    act(() => {
      const closed = result.current.closeTab(workspaceId, shellTabId("a"));
      expect(closed).toEqual({
        closed: true,
        tab: { id: shellTabId("a"), kind: "shell", shellId: "a" },
      });
    });

    expect(
      result.current.tabsByWorkspace[workspaceId]?.map((tab) => tab.id),
    ).toEqual([shellTabId("b"), "files"]);
    expect(result.current.activeTabByWorkspace[workspaceId]).toBe(
      shellTabId("b"),
    );
  });

  it("blocks closing a dirty file tab without force", async () => {
    vi.mocked(openFile).mockResolvedValue({
      entry: {
        name: "a.ts",
        path: "/tmp/a.ts",
        isDir: false,
        size: 1,
        mtime: null,
      },
      kind: "text",
      text: "hello",
      bytes: new Uint8Array([104, 101, 108, 108, 111]),
    });

    const { result } = renderHook(() => useSessionTabs());
    const path = "/tmp/a.ts";
    const tabId = fileTabId(path);

    await act(async () => {
      await result.current.openFileTab(workspaceId, hostId, {
        name: "a.ts",
        path,
        isDir: false,
        size: 1,
        mtime: null,
      });
    });

    act(() => {
      result.current.setFileText(workspaceId, path, "dirty");
    });

    let blocked: ReturnType<typeof result.current.closeTab> | undefined;
    act(() => {
      blocked = result.current.closeTab(workspaceId, tabId);
    });
    expect(blocked).toMatchObject({ closed: false, dirty: true });
    expect(result.current.tabsByWorkspace[workspaceId]?.some((tab) => tab.id === tabId)).toBe(
      true,
    );

    act(() => {
      const forced = result.current.closeTab(workspaceId, tabId, { force: true });
      expect(forced).toMatchObject({ closed: true });
    });
    expect(
      result.current.tabsByWorkspace[workspaceId]?.some((tab) => tab.id === tabId),
    ).toBe(false);
  });

  it("reorders tabs by id list", () => {
    const { result } = renderHook(() => useSessionTabs());

    act(() => {
      result.current.syncShellTabs(workspaceId, ["a", "b"]);
      result.current.openToolTab(workspaceId, "files");
    });

    act(() => {
      result.current.reorderTabs(workspaceId, [
        "files",
        shellTabId("b"),
        shellTabId("a"),
      ]);
    });

    expect(
      result.current.tabsByWorkspace[workspaceId]?.map((tab) => tab.id),
    ).toEqual(["files", shellTabId("b"), shellTabId("a")]);
  });
});
