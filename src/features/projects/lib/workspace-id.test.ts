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
    expect(parseWorkspaceId("::adhoc")).toBeNull();
    expect(parseWorkspaceId("h1::project::")).toBeNull();
    expect(parseWorkspaceId("h1")).toBeNull();
    expect(parseWorkspaceId("::project::p1")).toBeNull();
  });

  it("round-trips encode and parse", () => {
    const adhoc = adhocWorkspaceId("host-a");
    const project = projectWorkspaceId("host-a", "proj-1");
    expect(toWorkspaceId(parseWorkspaceId(adhoc)!)).toBe(adhoc);
    expect(toWorkspaceId(parseWorkspaceId(project)!)).toBe(project);
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
