import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "@/features/projects/types";
import {
  normalizeProjectConfig,
  validateProjectConfig,
} from "@/features/projects/lib/validate";

const project: ProjectConfig = {
  id: "p1",
  hostId: "h1",
  name: "app",
  path: "/srv/app",
  activeWorktreePath: null,
};

describe("validateProjectConfig", () => {
  it("requires name and path", () => {
    expect(validateProjectConfig(project)).toBeNull();
    expect(validateProjectConfig({ name: " ", path: "/x" })).toBe(
      "Name is required",
    );
    expect(validateProjectConfig({ name: "app", path: "" })).toBe(
      "Directory is required",
    );
  });
});

describe("normalizeProjectConfig", () => {
  it("trims fields and nulls matching worktree", () => {
    expect(
      normalizeProjectConfig({
        ...project,
        name: " app ",
        path: " /srv/app ",
        activeWorktreePath: "/srv/app/",
      }),
    ).toEqual({
      ...project,
      name: "app",
      path: "/srv/app",
      activeWorktreePath: null,
    });
  });

  it("keeps a distinct active worktree path", () => {
    expect(
      normalizeProjectConfig({
        ...project,
        activeWorktreePath: " /srv/app/.worktrees/feat ",
      }).activeWorktreePath,
    ).toBe("/srv/app/.worktrees/feat");
  });
});
