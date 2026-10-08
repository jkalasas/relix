import { describe, expect, it } from "vitest";
import {
  adhocWorkspaceId,
  hostIdFromWorkspaceId,
  isWorkspaceForHost,
  parseWorkspaceId,
  projectWorkspaceId,
  scopeLabel,
  toWorkspaceId,
} from "@/features/projects/lib/workspace-id";

describe("workspace ids", () => {
  it("encodes adhoc and project refs", () => {
    expect(adhocWorkspaceId("h1")).toBe("h1::adhoc");
    expect(projectWorkspaceId("h1", "p1")).toBe("h1::project::p1");
    expect(
      toWorkspaceId({ hostId: "h1", scope: { kind: "adhoc" } }),
    ).toBe("h1::adhoc");
    expect(
      toWorkspaceId({
        hostId: "h1",
        scope: { kind: "project", projectId: "p1" },
      }),
    ).toBe("h1::project::p1");
  });

  it("parses valid ids and rejects malformed ones", () => {
    expect(parseWorkspaceId("h1::adhoc")).toEqual({
      hostId: "h1",
      scope: { kind: "adhoc" },
    });
    expect(parseWorkspaceId("h1::project::p1")).toEqual({
      hostId: "h1",
      scope: { kind: "project", projectId: "p1" },
    });
    expect(parseWorkspaceId("h1::project::p1::worktree::%2Fsrv%2Fapp-wt")).toEqual({
      hostId: "h1",
      scope: { kind: "project", projectId: "p1", worktreePath: "/srv/app-wt" },
    });
    expect(parseWorkspaceId("::adhoc")).toBeNull();
    expect(parseWorkspaceId("h1::project::")).toBeNull();
    expect(parseWorkspaceId("h1")).toBeNull();
    expect(parseWorkspaceId("::project::p1")).toBeNull();
    expect(parseWorkspaceId("h1::project::p1::worktree::")).toBeNull();
    expect(parseWorkspaceId("h1::project::p1::worktree::%ZZ")).toBeNull();
  });

  it("round-trips encode and parse", () => {
    const adhoc = adhocWorkspaceId("host-a");
    const project = projectWorkspaceId("host-a", "proj-1");
    const worktree = projectWorkspaceId("host-a", "proj-1", "/srv/app-wt");
    const spaced = projectWorkspaceId("host-a", "proj-1", "/srv/my wt");
    expect(toWorkspaceId(parseWorkspaceId(adhoc)!)).toBe(adhoc);
    expect(toWorkspaceId(parseWorkspaceId(project)!)).toBe(project);
    expect(toWorkspaceId(parseWorkspaceId(worktree)!)).toBe(worktree);
    expect(toWorkspaceId(parseWorkspaceId(spaced)!)).toBe(spaced);
    expect(projectWorkspaceId("host-a", "proj-1", "  ")).toBe(project);
  });

  it("derives host id and host membership", () => {
    expect(hostIdFromWorkspaceId("h1::adhoc")).toBe("h1");
    expect(hostIdFromWorkspaceId("bad")).toBeNull();
    expect(isWorkspaceForHost("h1::adhoc", "h1")).toBe(true);
    expect(isWorkspaceForHost("h1::project::p1", "h1")).toBe(true);
    expect(isWorkspaceForHost("h2::adhoc", "h1")).toBe(false);
  });

  it("labels scopes", () => {
    expect(scopeLabel({ kind: "adhoc" })).toBe("Ad hoc");
    expect(scopeLabel({ kind: "project", projectId: "p1" }, "App")).toBe("App");
    expect(scopeLabel({ kind: "project", projectId: "p1" }, "  ")).toBe(
      "Project",
    );
    expect(scopeLabel({ kind: "project", projectId: "p1" })).toBe("Project");
  });
});
