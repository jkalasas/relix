import { useEffect, useMemo } from "react";
import type { AppPage, ForwardFormMode } from "@/app/types";
import type { useForwards } from "@/features/forwards";
import { useGit, useGitWorktrees } from "@/features/git";
import { isLocalHost, type Host } from "@/features/hosts";
import { useFiles } from "@/features/files";
import {
  parseWorkspaceId,
  pathsMatch,
  projectActiveRoot,
  scopeLabel,
  type useProjects,
  type WorkspaceId,
} from "@/features/projects";
import type { useSessionTabs } from "@/features/session-tabs";
import type { LiveTerminal, useShells } from "@/features/shells";

type UseWorkspaceViewOptions = {
  page: AppPage;
  hostId: string | null;
  workspaceId: WorkspaceId | null;
  forwardFormMode: ForwardFormMode;
  hosts: Host[];
  openHosts: () => void;
  shells: ReturnType<typeof useShells>;
  sessionTabs: ReturnType<typeof useSessionTabs>;
  projects: ReturnType<typeof useProjects>;
  forwards: ReturnType<typeof useForwards>;
  isDesktop: boolean;
};

export function useWorkspaceView({
  page,
  hostId,
  workspaceId,
  forwardFormMode,
  hosts,
  openHosts,
  shells,
  sessionTabs,
  projects,
  forwards,
  isDesktop,
}: UseWorkspaceViewOptions) {
  const selectedHost = useMemo(() => {
    if (!hostId) return null;
    return hosts.find((host) => host.id === hostId) ?? null;
  }, [hosts, hostId]);

  useEffect(() => {
    const pageName = page.name;
    const pageHostId = hostId;
    if (
      (pageName === "projects" ||
        pageName === "workspace" ||
        pageName === "project-form") &&
      pageHostId &&
      !hosts.some((host) => host.id === pageHostId)
    ) {
      openHosts();
    }
  }, [hosts, hostId, openHosts, page.name]);

  const selectedIsLocal = selectedHost ? isLocalHost(selectedHost) : false;
  const activeWorkspaceId = workspaceId;

  const activeProject = useMemo(() => {
    if (
      page.name !== "workspace" ||
      page.scope.kind !== "project" ||
      !selectedHost
    ) {
      return null;
    }
    return projects.getProject(selectedHost.id, page.scope.projectId);
  }, [projects, selectedHost, page]);

  const activeScopeLabel = useMemo(() => {
    if (page.name !== "workspace") return "Ad hoc";
    return scopeLabel(page.scope, activeProject?.name);
  }, [activeProject?.name, page]);

  const projectRootPath =
    page.name === "workspace" && page.scope.kind === "project" && activeProject
      ? projectActiveRoot(activeProject)
      : null;

  const selectedSessions = activeWorkspaceId
    ? (shells.sessionsByWorkspace[activeWorkspaceId] ?? [])
    : [];
  const activeSessionId = activeWorkspaceId
    ? (shells.activeSessionByWorkspace[activeWorkspaceId] ?? null)
    : null;
  const activeSession =
    selectedSessions.find((session) => session.id === activeSessionId) ?? null;

  const selectedTabs = activeWorkspaceId
    ? (sessionTabs.tabsByWorkspace[activeWorkspaceId] ?? [])
    : [];
  const activeTabId = activeWorkspaceId
    ? (sessionTabs.activeTabByWorkspace[activeWorkspaceId] ?? null)
    : null;
  const activeTab =
    selectedTabs.find((tab) => tab.id === activeTabId) ?? null;
  const selectedFiles = activeWorkspaceId
    ? (sessionTabs.filesByWorkspace[activeWorkspaceId] ?? {})
    : {};

  const trackedSessionId =
    activeTab?.kind === "shell" ? activeTab.shellId : activeSessionId;
  const trackedSession =
    selectedSessions.find((session) => session.id === trackedSessionId) ??
    activeSession;
  const activeShellCwd = trackedSession?.cwd ?? null;

  const inWorkspace =
    page.name === "workspace" &&
    selectedHost != null &&
    !forwardFormMode;

  const explorerChromeOpen =
    inWorkspace &&
    (activeTab?.kind === "files" || activeTab?.kind === "file");

  const portsChromeOpen =
    inWorkspace && !selectedIsLocal && activeTab?.kind === "ports";

  const gitChromeOpen = inWorkspace && activeTab?.kind === "git";

  const shellChromeOpen =
    inWorkspace &&
    !explorerChromeOpen &&
    !portsChromeOpen &&
    !gitChromeOpen;

  const gitCwd = projectRootPath ?? activeShellCwd;

  const files = useFiles({
    hostId: selectedHost?.id ?? "__none__",
    connected: selectedHost?.status === "connected",
    enabled: inWorkspace,
    shellCwd: projectRootPath ? null : activeShellCwd,
    rootPath: projectRootPath,
    tmuxSession:
      !selectedHost || projectRootPath
        ? undefined
        : (trackedSession?.tmuxSession ?? selectedHost.tmuxSession),
    tmuxWindowId:
      !selectedHost || projectRootPath
        ? undefined
        : trackedSession?.tmuxWindowId,
  });

  const git = useGit({
    hostId: selectedHost?.id ?? "__none__",
    connected: selectedHost?.status === "connected",
    enabled: gitChromeOpen,
    cwd: gitCwd,
  });

  const worktreeListCwd = activeProject?.path ?? null;
  const gitWorktrees = useGitWorktrees({
    hostId: selectedHost?.id ?? "__none__",
    connected:
      selectedHost != null &&
      (selectedIsLocal || selectedHost.status === "connected"),
    enabled: inWorkspace && activeProject != null,
    cwd: worktreeListCwd,
  });

  useEffect(() => {
    if (!activeProject || gitWorktrees.loading || gitWorktrees.error) return;
    if (gitWorktrees.worktrees.length === 0) return;
    const override = activeProject.activeWorktreePath?.trim();
    if (!override || pathsMatch(override, activeProject.path)) return;
    const known = gitWorktrees.worktrees.some((entry) =>
      pathsMatch(entry.path, override),
    );
    if (known) return;
    void projects.saveProject({
      ...activeProject,
      activeWorktreePath: null,
    });
  }, [
    activeProject,
    gitWorktrees.error,
    gitWorktrees.loading,
    gitWorktrees.worktrees,
    projects.saveProject,
  ]);

  const showFileRail =
    isDesktop &&
    inWorkspace &&
    selectedHost != null &&
    selectedHost.status === "connected";

  const liveTerminals = useMemo(() => {
    const list: LiveTerminal[] = [];
    for (const [id, sessions] of Object.entries(shells.sessionsByWorkspace)) {
      const sessionHostId =
        sessions[0]?.hostId ?? parseWorkspaceId(id)?.hostId;
      if (!sessionHostId) continue;
      const host = hosts.find((item) => item.id === sessionHostId);
      if (!host) continue;
      for (const session of sessions) {
        if (!session.channelId) continue;
        list.push({ workspaceId: id, host, session });
      }
    }
    return list;
  }, [hosts, shells.sessionsByWorkspace]);

  const shellActiveSessionId = useMemo(() => {
    if (!activeWorkspaceId) return null;
    if (activeTab?.kind === "shell") return activeTab.shellId;
    return activeSessionId;
  }, [activeSessionId, activeTab, activeWorkspaceId]);

  const openWorkspaceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, sessions] of Object.entries(shells.sessionsByWorkspace)) {
      if (sessions.length > 0) ids.add(id);
    }
    for (const [id, tabs] of Object.entries(sessionTabs.tabsByWorkspace)) {
      if (tabs.length > 0) ids.add(id);
    }
    return ids;
  }, [sessionTabs.tabsByWorkspace, shells.sessionsByWorkspace]);

  const selectedForwards = selectedHost
    ? (forwards.forwardsByHost[selectedHost.id] ?? [])
    : [];

  const editingHost =
    page.name === "host-form" && page.mode === "edit" && page.hostId
      ? (hosts.find((host) => host.id === page.hostId) ?? null)
      : null;

  const editingProject =
    page.name === "project-form" && page.mode === "edit" && page.projectId
      ? projects.getProject(page.hostId, page.projectId)
      : null;

  const editingForward =
    forwardFormMode?.type === "edit"
      ? (selectedForwards.find(
          (forward) => forward.id === forwardFormMode.id,
        ) ?? null)
      : null;

  const projectsHost =
    page.name === "projects" || page.name === "project-form"
      ? (hosts.find((host) => host.id === page.hostId) ?? null)
      : null;

  const openFileTabs = useMemo(() => {
    return selectedTabs.filter(
      (tab): tab is Extract<(typeof selectedTabs)[number], { kind: "file" }> =>
        tab.kind === "file",
    );
  }, [selectedTabs]);

  const canSaveAdhocProject =
    inWorkspace &&
    selectedHost != null &&
    page.name === "workspace" &&
    page.scope.kind === "adhoc" &&
    Boolean(
      (activeShellCwd?.trim() && activeShellCwd.trim() !== ".") ||
        (files.path?.trim() && files.path.trim() !== "."),
    );

  return {
    selectedHost,
    selectedIsLocal,
    activeWorkspaceId,
    activeProject,
    activeScopeLabel,
    projectRootPath,
    selectedSessions,
    activeSessionId,
    activeSession,
    selectedTabs,
    activeTabId,
    activeTab,
    selectedFiles,
    trackedSession,
    activeShellCwd,
    inWorkspace,
    explorerChromeOpen,
    portsChromeOpen,
    gitChromeOpen,
    shellChromeOpen,
    files,
    git,
    gitWorktrees,
    showFileRail,
    liveTerminals,
    shellActiveSessionId,
    openWorkspaceIds,
    selectedForwards,
    editingHost,
    editingProject,
    editingForward,
    projectsHost,
    openFileTabs,
    canSaveAdhocProject,
  };
}
