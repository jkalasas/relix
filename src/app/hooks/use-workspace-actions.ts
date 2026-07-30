import { useCallback } from "react";
import type { AppPage } from "@/app/types";
import type { PortForwardConfig, useForwards } from "@/features/forwards";
import type { Host, HostConfig } from "@/features/hosts";
import type {
  ProjectConfig,
  useProjects,
  WorkspaceId,
} from "@/features/projects";
import {
  adhocWorkspaceId,
  projectWorkspaceId,
} from "@/features/projects";
import type { useSessionTabs } from "@/features/session-tabs";
import type { useShells } from "@/features/shells";

type WorkspaceNav = {
  afterSaveHost: (hostId: string) => void;
  afterDeleteHost: (hostId: string) => void;
  afterSaveProject: (hostId: string, projectId: string) => void;
  afterDeleteProject: (hostId: string, projectId: string) => void;
  afterSaveForward: () => void;
  closeForwardForm: () => void;
  openAddProject: (
    hostId: string,
    options?: { initialPath?: string; migrateFromAdhoc?: boolean },
  ) => void;
  page: AppPage;
};

type UseWorkspaceActionsOptions = {
  page: AppPage;
  selectedHost: Host | null;
  activeWorkspaceId: WorkspaceId | null;
  activeShellCwd: string | null;
  filesPath: string | null | undefined;
  hosts: {
    saveHost: (config: HostConfig) => Promise<void>;
    deleteHost: (id: string) => Promise<void>;
  };
  forwards: ReturnType<typeof useForwards>;
  shells: ReturnType<typeof useShells>;
  sessionTabs: ReturnType<typeof useSessionTabs>;
  projects: ReturnType<typeof useProjects>;
  workspace: WorkspaceNav;
};

export function useWorkspaceActions({
  page,
  selectedHost,
  activeWorkspaceId,
  activeShellCwd,
  filesPath,
  hosts,
  forwards,
  shells,
  sessionTabs,
  projects,
  workspace,
}: UseWorkspaceActionsOptions) {
  const handleSaveHost = useCallback(
    async (config: HostConfig) => {
      await hosts.saveHost(config);
      forwards.ensureHostForwards(config.id);
      workspace.afterSaveHost(config.id);
    },
    [forwards.ensureHostForwards, hosts.saveHost, workspace.afterSaveHost],
  );

  const handleDeleteHost = useCallback(
    async (id: string) => {
      await hosts.deleteHost(id);
      workspace.afterDeleteHost(id);
    },
    [hosts.deleteHost, workspace.afterDeleteHost],
  );

  const handleSaveProject = useCallback(
    async (config: ProjectConfig) => {
      const migrateFromAdhoc =
        page.name === "project-form" && page.migrateFromAdhoc === true;
      await projects.saveProject(config);

      if (migrateFromAdhoc) {
        const fromId = adhocWorkspaceId(config.hostId);
        const toId = projectWorkspaceId(config.hostId, config.id);
        shells.moveWorkspaceShells(fromId, toId);
        sessionTabs.moveWorkspace(fromId, toId);
      }

      workspace.afterSaveProject(config.hostId, config.id);
    },
    [
      page,
      projects.saveProject,
      sessionTabs.moveWorkspace,
      shells.moveWorkspaceShells,
      workspace.afterSaveProject,
    ],
  );

  const handleSaveAdhocAsProject = useCallback(() => {
    if (!selectedHost) return;
    if (page.name !== "workspace" || page.scope.kind !== "adhoc") {
      return;
    }
    const path = activeShellCwd?.trim() || filesPath?.trim() || "";
    if (!path || path === ".") return;
    workspace.openAddProject(selectedHost.id, {
      initialPath: path,
      migrateFromAdhoc: true,
    });
  }, [
    activeShellCwd,
    filesPath,
    page,
    selectedHost,
    workspace.openAddProject,
  ]);

  const handleDeleteProject = useCallback(
    async (hostId: string, projectId: string) => {
      const workspaceId = projectWorkspaceId(hostId, projectId);
      const sessions = shells.sessionsByWorkspace[workspaceId] ?? [];
      for (const session of sessions) {
        await shells.closeShell(workspaceId, hostId, session.id);
      }
      sessionTabs.removeWorkspace(workspaceId);
      shells.removeWorkspaceShells(workspaceId);
      await projects.deleteProject(hostId, projectId);
      workspace.afterDeleteProject(hostId, projectId);
    },
    [
      projects.deleteProject,
      sessionTabs.removeWorkspace,
      shells.closeShell,
      shells.removeWorkspaceShells,
      shells.sessionsByWorkspace,
      workspace.afterDeleteProject,
    ],
  );

  const handleSaveForward = useCallback(
    (config: PortForwardConfig) => {
      if (!selectedHost || !activeWorkspaceId) return;
      forwards.saveForward(selectedHost.id, config);
      workspace.afterSaveForward();
      sessionTabs.openToolTab(activeWorkspaceId, "ports");
    },
    [
      activeWorkspaceId,
      forwards.saveForward,
      selectedHost,
      sessionTabs.openToolTab,
      workspace.afterSaveForward,
    ],
  );

  const handleDeleteForward = useCallback(
    async (forwardId: string) => {
      if (!selectedHost) return;
      await forwards.deleteForward(selectedHost.id, forwardId);
      workspace.closeForwardForm();
    },
    [forwards.deleteForward, selectedHost, workspace.closeForwardForm],
  );

  return {
    handleSaveHost,
    handleDeleteHost,
    handleSaveProject,
    handleSaveAdhocAsProject,
    handleDeleteProject,
    handleSaveForward,
    handleDeleteForward,
  };
}
