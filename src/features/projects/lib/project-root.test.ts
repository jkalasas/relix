import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "@/features/projects/types";
import {
  normalizeFsPath,
  pathsMatch,
  projectActiveRoot,
} from "@/features/projects/lib/project-root";

const project: ProjectConfig = {
  id: "p1",
  hostId: "h1",
  name: "app",
  path: "/srv/app",
  activeWorktreePath: null,
};

describe("normalizeFsPath", () => {
  it("trims and strips trailing separators", () => {
    expect(normalizeFsPath("")).toBe(".");
    expect(normalizeFsPath(".")).toBe(".");
    expect(normalizeFsPath(" /srv/app/ ")).toBe("/srv/app");
    expect(normalizeFsPath("C:\\work\\")).toBe("C:\\work");
  });
});

describe("pathsMatch", () => {
  it("compares normalized paths", () => {
    expect(pathsMatch("/srv/app/", "/srv/app")).toBe(true);
    expect(pathsMatch("/srv/app", "/srv/other")).toBe(false);
  });
});

describe("projectActiveRoot", () => {
  it("uses path when worktree is absent or equal", () => {
    expect(projectActiveRoot(project)).toBe("/srv/app");
    expect(
      projectActiveRoot({ ...project, activeWorktreePath: "/srv/app/" }),
    ).toBe("/srv/app");
  });

  it("prefers a distinct worktree override", () => {
    expect(
      projectActiveRoot({
        ...project,
        activeWorktreePath: " /srv/app/.worktrees/feat ",
      }),
    ).toBe("/srv/app/.worktrees/feat");
  });
});
