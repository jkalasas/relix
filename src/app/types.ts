import type { WorkspaceScope } from "@/features/projects";

export type AppPage =
  | { name: "hosts" }
  | { name: "projects"; hostId: string }
  | { name: "workspace"; hostId: string; scope: WorkspaceScope }
  | { name: "host-form"; mode: "add" | "edit"; hostId?: string }
  | {
      name: "project-form";
      hostId: string;
      mode: "add" | "edit";
      projectId?: string;
      initialPath?: string;
      migrateFromAdhoc?: boolean;
    };

export type ForwardFormMode =
  | { type: "add" }
  | { type: "edit"; id: string }
  | null;
