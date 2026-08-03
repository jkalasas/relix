import { describe, expect, it } from "vitest";
import type { HostProjectEntry, ProjectConfig } from "@/features/projects/types";
import {
  parseHostProjectsFile,
  serializeHostProjectsFile,
  toHostProjectEntry,
  toProjectConfig,
} from "@/features/projects/lib/host-registry";

const entry: HostProjectEntry = {
  id: "p1",
  name: "app",
  path: "/srv/app",
  activeWorktreePath: null,
};

const project: ProjectConfig = {
  id: "p1",
  hostId: "h1",
  name: "app",
  path: "/srv/app",
  activeWorktreePath: null,
};

describe("toHostProjectEntry / toProjectConfig", () => {
  it("round-trips with host id", () => {
    expect(toHostProjectEntry(project)).toEqual(entry);
    expect(toProjectConfig("h1", entry)).toEqual(project);
  });
});

describe("parseHostProjectsFile", () => {
  it("returns empty for blank input", () => {
    expect(parseHostProjectsFile("")).toEqual([]);
    expect(parseHostProjectsFile("   \n")).toEqual([]);
  });

  it("parses valid registry and trims fields", () => {
    const text = JSON.stringify({
      version: 1,
      projects: [
        {
          id: "p1",
          name: " app ",
          path: " /srv/app ",
          activeWorktreePath: " /srv/app/wt ",
        },
        { id: 1, name: "bad" },
      ],
    });
    expect(parseHostProjectsFile(text)).toEqual([
      {
        id: "p1",
        name: "app",
        path: "/srv/app",
        activeWorktreePath: "/srv/app/wt",
      },
    ]);
  });

  it("throws on invalid JSON or shape", () => {
    expect(() => parseHostProjectsFile("{")).toThrow(
      "Host projects registry is not valid JSON",
    );
    expect(() => parseHostProjectsFile("[]")).toThrow(
      "Host projects registry is invalid",
    );
    expect(() =>
      parseHostProjectsFile(JSON.stringify({ version: "1", projects: [] })),
    ).toThrow("Host projects registry version is invalid");
    expect(() =>
      parseHostProjectsFile(JSON.stringify({ version: 2, projects: [] })),
    ).toThrow("Unsupported host projects registry version 2");
    expect(() =>
      parseHostProjectsFile(JSON.stringify({ version: 1 })),
    ).toThrow("Host projects registry is missing projects");
  });
});

describe("serializeHostProjectsFile", () => {
  it("writes versioned pretty JSON with trailing newline", () => {
    const text = serializeHostProjectsFile([
      { ...entry, activeWorktreePath: "/wt" },
    ]);
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({
      version: 1,
      projects: [
        {
          id: "p1",
          name: "app",
          path: "/srv/app",
          activeWorktreePath: "/wt",
        },
      ],
    });
  });
});
