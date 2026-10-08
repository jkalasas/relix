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
  isWorkspaceForProject,
  pathsMatch,
  projectWorkspaceId,
} from "@/features/projects";
import type { useSessionTabs } from "@/features/session-tabs";
import type { useShells } from "@/features/shells";

type WorkspaceNav = {
  afterSaveHost: (hostId: string) => void;
  afterDeleteHost: (hostId: string) => void;
  afterSaveProject: (
    hostId: string,
    projectId: string,
    worktreePath?: string | null,
  ) => void;
  afterDeleteProject: (hostId: string) => void;
  afterSaveForward: () => void;
  closeForwardForm: () => void;
  selectPanelTab: (tab: "files" | "git" | "ports") => void;
  openMobileTool: (tab: "files" | "git" | "ports") => void;
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
        try {
          await shells.moveWorkspaceShells(fromId, toId, {
            tmuxSession: selectedHost?.tmuxSession,
          });
          sessionTabs.moveWorkspace(fromId, toId);
        } catch {
          // Registry write already succeeded; still open the new workspace
          // so a tmux move failure can't leave the form stuck.
          try {
            sessionTabs.moveWorkspace(fromId, toId);
          } catch {
            // tabs are best-effort here
          }
        }
      }

      workspace.afterSaveProject(
        config.hostId,
        config.id,
        page.name === "workspace" &&
          page.scope.kind === "project" &&
          page.scope.projectId === config.id
          ? (page.scope.worktreePath ?? null)
          : null,
      );
    },
    [
      page,
      projects.saveProject,
      selectedHost?.tmuxSession,
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

  const handleSetProjectWorktree = useCallback(
    async (hostId: string, projectId: string, worktreePath: string | null) => {
      const project = projects.getProject(hostId, projectId);
      if (!project) return;
      const nextPath = worktreePath?.trim() || null;
      const activeWorktreePath =
        nextPath && !pathsMatch(nextPath, project.path) ? nextPath : null;
      const current = project.activeWorktreePath?.trim() || null;
      const currentNormalized =
        current && !pathsMatch(current, project.path) ? current : null;
      if (
        (activeWorktreePath == null && currentNormalized == null) ||
        (activeWorktreePath != null &&
          currentNormalized != null &&
          pathsMatch(activeWorktreePath, currentNormalized))
      ) {
        return;
      }
      await projects.saveProject({
        ...project,
        activeWorktreePath,
      });
    },
    [projects.getProject, projects.saveProject],
  );

  const handleDeleteProject = useCallback(
    async (hostId: string, projectId: string) => {
      const matchingIds = new Set<string>();
      for (const id of Object.keys(shells.sessionsByWorkspace)) {
        if (isWorkspaceForProject(id, hostId, projectId)) matchingIds.add(id);
      }
      for (const id of Object.keys(sessionTabs.tabsByWorkspace)) {
        if (isWorkspaceForProject(id, hostId, projectId)) matchingIds.add(id);
      }
      await Promise.allSettled(
        [...matchingIds].flatMap((workspaceId) =>
          (shells.sessionsByWorkspace[workspaceId] ?? []).map((session) =>
            shells.closeShell(workspaceId, hostId, session.id),
          ),
        ),
      );
      for (const workspaceId of matchingIds) {
        sessionTabs.removeWorkspace(workspaceId);
        shells.removeWorkspaceShells(workspaceId);
      }
      await projects.deleteProject(hostId, projectId);
      workspace.afterDeleteProject(hostId);
    },
    [
      projects.deleteProject,
      sessionTabs.removeWorkspace,
      sessionTabs.tabsByWorkspace,
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
      workspace.selectPanelTab("ports");
      workspace.openMobileTool("ports");
    },
    [
      activeWorkspaceId,
      forwards.saveForward,
      selectedHost,
      workspace.afterSaveForward,
      workspace.selectPanelTab,
      workspace.openMobileTool,
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
    handleSetProjectWorktree,
    handleDeleteProject,
    handleSaveForward,
    handleDeleteForward,
  };
}
