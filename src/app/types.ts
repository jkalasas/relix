export type MobilePane = "hosts" | "session";

export type WorkspaceTab = "terminal" | "sftp" | "forwards";

export type FormMode = { type: "add" } | { type: "edit"; id: string } | null;

export type ForwardFormMode =
  | { type: "add" }
  | { type: "edit"; id: string }
  | null;
