export type ProjectConfig = {
  id: string;
  hostId: string;
  name: string;
  path: string;
};

export type WorkspaceScope =
  | { kind: "adhoc" }
  | { kind: "project"; projectId: string };

export type WorkspaceRef = {
  hostId: string;
  scope: WorkspaceScope;
};

export type WorkspaceId = string;
