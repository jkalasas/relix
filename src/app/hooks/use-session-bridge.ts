import { useCallback, useEffect, useRef, useState } from "react";
import { isLocalHost, type Host } from "@/features/hosts";
import type {
  useProjects,
  WorkspaceId,
  WorkspaceScope,
} from "@/features/projects";
import {
  useSessionTabShortcuts,
  type useSessionTabs,
} from "@/features/session-tabs";
import {
  useActiveShellFallback,
  type useShells,
} from "@/features/shells";
import type { FsEntry } from "@/features/ssh";

type UseSessionBridgeOptions = {
  hosts: Host[];
  setHostStatus: (
    id: string,
    status: "connected" | "idle" | "error",
    lastError?: string,
  ) => void;
  shells: ReturnType<typeof useShells>;
  sessionTabs: ReturnType<typeof useSessionTabs>;
  projects: ReturnType<typeof useProjects>;
  workspaceId: WorkspaceId | null;
  hostId: string | null;
  workspaceScope: WorkspaceScope | null;
  selectedHost: Host | null;
  inWorkspace: boolean;
  projectRootPath: string | null;
};

export function useSessionBridge({
  hosts,
  setHostStatus,
  shells,
  sessionTabs,
  projects,
  workspaceId,
  hostId,
  workspaceScope,
  selectedHost,
  inWorkspace,
  projectRootPath,
}: UseSessionBridgeOptions) {
  const [discardTarget, setDiscardTarget] = useState<{
    workspaceId: string;
    hostId: string;
    tabId: string;
    fileName: string;
  } | null>(null);

  const sessionTabsRef = useRef(sessionTabs);
  sessionTabsRef.current = sessionTabs;

  const workspaceIdRef = useRef(workspaceId);
  const hostIdRef = useRef(hostId);
  const workspaceScopeRef = useRef(workspaceScope);
  const hostsRef = useRef(hosts);
  const projectsRef = useRef(projects);

  workspaceIdRef.current = workspaceId;
  hostIdRef.current = hostId;
  workspaceScopeRef.current = workspaceScope;
  hostsRef.current = hosts;
  projectsRef.current = projects;

  const openShell = useCallback(
    async (
      targetWorkspaceId: string,
      targetHostId: string,
      launchId?: Parameters<typeof shells.openShell>[2],
      cwd?: string,
    ) => {
      const host = hosts.find((item) => item.id === targetHostId);
      const local = host ? isLocalHost(host) : false;
      try {
        const sessionId = await shells.openShell(
          targetWorkspaceId,
          targetHostId,
          launchId,
          {
            shellMode: local ? "plain" : host?.shellMode,
            tmuxSession: local ? undefined : host?.tmuxSession,
            cwd,
          },
        );
        if (sessionId) {
          sessionTabsRef.current.activateShellTab(
            targetWorkspaceId,
            sessionId,
          );
        }
      } catch {
        if (!local) {
          setHostStatus(targetHostId, "error", "Failed to open shell");
        }
      }
    },
    [hosts, setHostStatus, shells.openShell],
  );

  const selectShell = useCallback(
    (targetWorkspaceId: string, targetHostId: string, sessionId: string) => {
      void shells
        .selectShell(targetWorkspaceId, targetHostId, sessionId)
        .catch(() => {
          setHostStatus(targetHostId, "error", "Failed to attach shell");
        });
    },
    [setHostStatus, shells.selectShell],
  );

  useActiveShellFallback(
    workspaceId,
    selectedHost?.id ?? null,
    shells.sessionsByWorkspace,
    shells.activeSessionByWorkspace,
    selectShell,
  );

  useEffect(() => {
    if (!workspaceId) return;
    const tabs = sessionTabs.tabsByWorkspace[workspaceId] ?? [];
    if (tabs.length === 0) return;
    const activeId = sessionTabs.activeTabByWorkspace[workspaceId] ?? null;
    if (activeId && tabs.some((tab) => tab.id === activeId)) return;
    sessionTabs.selectTab(workspaceId, tabs[0].id);
    const tab = tabs[0];
    if (tab.kind === "shell" && selectedHost) {
      selectShell(workspaceId, selectedHost.id, tab.shellId);
    }
  }, [
    workspaceId,
    selectShell,
    selectedHost,
    sessionTabs.activeTabByWorkspace,
    sessionTabs.selectTab,
    sessionTabs.tabsByWorkspace,
  ]);

  useEffect(() => {
    for (const [id, sessions] of Object.entries(shells.sessionsByWorkspace)) {
      sessionTabs.syncShellTabs(
        id,
        sessions.map((session) => session.id),
      );
    }
  }, [sessionTabs.syncShellTabs, shells.sessionsByWorkspace]);

  useEffect(() => {
    for (const [id, activeShellId] of Object.entries(
      shells.activeSessionByWorkspace,
    )) {
      if (!activeShellId) continue;
      const tabs = sessionTabs.tabsByWorkspace[id] ?? [];
      const activeTabId = sessionTabs.activeTabByWorkspace[id];
      if (activeTabId) continue;
      if (
        !tabs.some(
          (tab) => tab.kind === "shell" && tab.shellId === activeShellId,
        )
      ) {
        continue;
      }
      sessionTabs.activateShellTab(id, activeShellId);
    }
  }, [
    sessionTabs.activateShellTab,
    sessionTabs.activeTabByWorkspace,
    sessionTabs.tabsByWorkspace,
    shells.activeSessionByWorkspace,
  ]);

  const selectSessionTab = useCallback(
    (tabId: string) => {
      if (!selectedHost || !workspaceId) return;
      sessionTabs.selectTab(workspaceId, tabId);
      const tab = (sessionTabs.tabsByWorkspace[workspaceId] ?? []).find(
        (item) => item.id === tabId,
      );
      if (tab?.kind === "shell") {
        selectShell(workspaceId, selectedHost.id, tab.shellId);
      }
    },
    [workspaceId, selectedHost, selectShell, sessionTabs],
  );

  const closeSessionTab = useCallback(
    (tabId: string) => {
      if (!selectedHost || !workspaceId) return;
      const tab = (sessionTabs.tabsByWorkspace[workspaceId] ?? []).find(
        (item) => item.id === tabId,
      );
      if (!tab) return;

      if (tab.kind === "shell") {
        void shells.closeShell(workspaceId, selectedHost.id, tab.shellId);
        return;
      }

      const result = sessionTabs.closeTab(workspaceId, tabId);
      if (!result.closed && result.dirty && result.tab?.kind === "file") {
        setDiscardTarget({
          workspaceId,
          hostId: selectedHost.id,
          tabId,
          fileName: result.tab.name,
        });
      }
    },
    [workspaceId, selectedHost, sessionTabs, shells],
  );

  const confirmDiscardTab = useCallback(() => {
    if (!discardTarget) return;
    const { workspaceId: targetWorkspaceId, tabId } = discardTarget;
    sessionTabs.closeTab(targetWorkspaceId, tabId, { force: true });
    setDiscardTarget(null);
  }, [discardTarget, sessionTabs]);

  const clearDiscardTarget = useCallback(() => {
    setDiscardTarget(null);
  }, []);

  const handleOpenFile = useCallback(
    (entry: FsEntry) => {
      if (!selectedHost || !workspaceId) return;
      void sessionTabs.openFileTab(workspaceId, selectedHost.id, entry);
    },
    [workspaceId, selectedHost, sessionTabs],
  );

  const handleOpenShell = useCallback(
    (launchId?: Parameters<typeof shells.openShell>[2]) => {
      if (!selectedHost || !workspaceId) return;
      void openShell(
        workspaceId,
        selectedHost.id,
        launchId,
        projectRootPath ?? undefined,
      );
    },
    [workspaceId, openShell, projectRootPath, selectedHost],
  );

  const selectedTabs = workspaceId
    ? (sessionTabs.tabsByWorkspace[workspaceId] ?? [])
    : [];
  const activeTabId = workspaceId
    ? (sessionTabs.activeTabByWorkspace[workspaceId] ?? null)
    : null;

  useSessionTabShortcuts({
    enabled: inWorkspace,
    tabs: selectedTabs,
    activeId: activeTabId,
    onSelect: selectSessionTab,
  });

  const onShortcutShell = useCallback(() => {
    const currentWorkspaceId = workspaceIdRef.current;
    const currentHostId = hostIdRef.current;
    if (!currentWorkspaceId || !currentHostId) return;
    const tabs =
      sessionTabsRef.current.tabsByWorkspace[currentWorkspaceId] ?? [];
    const shellTab = tabs.find((tab) => tab.kind === "shell");
    if (shellTab) {
      sessionTabsRef.current.selectTab(currentWorkspaceId, shellTab.id);
      selectShell(currentWorkspaceId, currentHostId, shellTab.shellId);
      return;
    }
    const scope = workspaceScopeRef.current;
    const project =
      scope?.kind === "project"
        ? projectsRef.current.getProject(currentHostId, scope.projectId)
        : null;
    void openShell(
      currentWorkspaceId,
      currentHostId,
      undefined,
      project?.path,
    );
  }, [openShell, selectShell]);

  const onShortcutFiles = useCallback(() => {
    const currentWorkspaceId = workspaceIdRef.current;
    if (!currentWorkspaceId) return;
    sessionTabsRef.current.openToolTab(currentWorkspaceId, "files");
  }, []);

  const onShortcutPorts = useCallback(() => {
    const currentHostId = hostIdRef.current;
    const currentWorkspaceId = workspaceIdRef.current;
    if (!currentHostId || !currentWorkspaceId) return;
    const host = hostsRef.current.find((item) => item.id === currentHostId);
    if (!host || isLocalHost(host)) return;
    sessionTabsRef.current.openToolTab(currentWorkspaceId, "ports");
  }, []);

  const onShortcutGit = useCallback(() => {
    const currentWorkspaceId = workspaceIdRef.current;
    if (!currentWorkspaceId) return;
    sessionTabsRef.current.openToolTab(currentWorkspaceId, "git");
  }, []);

  return {
    openShell,
    selectShell,
    selectSessionTab,
    closeSessionTab,
    discardTarget,
    confirmDiscardTab,
    clearDiscardTarget,
    handleOpenFile,
    handleOpenShell,
    onShortcutShell,
    onShortcutFiles,
    onShortcutPorts,
    onShortcutGit,
  };
}
