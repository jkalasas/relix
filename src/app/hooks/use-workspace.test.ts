import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWorkspace } from "@/app/hooks/use-workspace";
import { adhocWorkspaceId } from "@/features/projects";

describe("useWorkspace", () => {
  it("navigates hosts → projects → workspace and tracks workspaceId", () => {
    const { result } = renderHook(() => useWorkspace({}));

    expect(result.current.page).toEqual({ name: "hosts" });
    expect(result.current.workspaceId).toBeNull();

    act(() => {
      result.current.openProjects("h1");
    });
    expect(result.current.page).toEqual({ name: "projects", hostId: "h1" });
    expect(result.current.hostId).toBe("h1");

    act(() => {
      result.current.openAdhoc("h1");
    });
    expect(result.current.page).toEqual({
      name: "workspace",
      hostId: "h1",
      scope: { kind: "adhoc" },
    });
    expect(result.current.workspaceId).toBe(adhocWorkspaceId("h1"));
  });

  it("handleBack walks the page stack and clears forward form first", () => {
    const { result } = renderHook(() => useWorkspace({}));

    act(() => {
      result.current.openAdhoc("h1");
      result.current.openAddForward();
    });
    expect(result.current.forwardFormMode).toEqual({ type: "add" });

    act(() => {
      expect(result.current.handleBack()).toBe(true);
    });
    expect(result.current.forwardFormMode).toBeNull();
    expect(result.current.page.name).toBe("workspace");

    act(() => {
      expect(result.current.handleBack()).toBe(true);
    });
    expect(result.current.page).toEqual({ name: "projects", hostId: "h1" });

    act(() => {
      expect(result.current.handleBack()).toBe(true);
    });
    expect(result.current.page).toEqual({ name: "hosts" });

    act(() => {
      expect(result.current.handleBack()).toBe(false);
    });
  });

  it("opens host and project forms and closes them correctly", () => {
    const { result } = renderHook(() => useWorkspace({}));

    act(() => {
      result.current.openAddHost();
    });
    expect(result.current.page).toEqual({ name: "host-form", mode: "add" });

    act(() => {
      result.current.closeHostForm();
    });
    expect(result.current.page).toEqual({ name: "hosts" });

    act(() => {
      result.current.openEditHost("h1");
    });
    act(() => {
      result.current.closeHostForm();
    });
    expect(result.current.page).toEqual({ name: "projects", hostId: "h1" });

    act(() => {
      result.current.openAddProject("h1", { migrateFromAdhoc: true });
    });
    act(() => {
      result.current.closeProjectForm();
    });
    expect(result.current.page).toEqual({
      name: "workspace",
      hostId: "h1",
      scope: { kind: "adhoc" },
    });
    expect(result.current.workspaceId).toBe(adhocWorkspaceId("h1"));
  });

});
