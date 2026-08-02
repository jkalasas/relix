export type HostProjectEntry = {
  id: string;
  name: string;
  path: string;
  activeWorktreePath?: string | null;
};

export type ProjectConfig = HostProjectEntry & {
  hostId: string;
};

export type WorkspaceScope =
  | { kind: "adhoc" }
  | { kind: "project"; projectId: string };

export type WorkspaceRef = {
  hostId: string;
  scope: WorkspaceScope;
};

export type WorkspaceId = string;
