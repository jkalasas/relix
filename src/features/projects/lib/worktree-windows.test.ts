import { describe, expect, it } from "vitest";
import {
  buildWorktreeHash,
  parseWorktreeHash,
} from "@/features/projects/lib/worktree-windows";

describe("worktree window hash", () => {
  it("round-trips host, project, and worktree path", () => {
    const hash = buildWorktreeHash({
      hostId: "h1",
      projectId: "p1",
      worktreePath: "/srv/app-wt",
    });
    expect(parseWorktreeHash(hash)).toEqual({
      hostId: "h1",
      projectId: "p1",
      worktreePath: "/srv/app-wt",
    });
  });

  it("omits the query for the project home", () => {
    const hash = buildWorktreeHash({ hostId: "h1", projectId: "p1" });
    expect(parseWorktreeHash(hash)).toEqual({
      hostId: "h1",
      projectId: "p1",
      worktreePath: null,
    });
  });

  it("rejects non-workspace hashes", () => {
    expect(parseWorktreeHash("")).toBeNull();
    expect(parseWorktreeHash("#/hosts")).toBeNull();
    expect(parseWorktreeHash("#/workspace//p1")).toBeNull();
  });
});
