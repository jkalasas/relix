import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useAndroidBack } from "@/app/use-android-back";
import { useBoot } from "@/app/use-boot";
import { useSshLifecycle } from "@/app/use-ssh-lifecycle";
import { useWorkspace } from "@/app/use-workspace";
import { DesktopTitleBar } from "@/components/workspace/desktop-title-bar";
import { SessionTabBar } from "@/components/workspace/session-tab-bar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  BackgroundSetupDialog,
  useAndroidBackground,
} from "@/features/android-background";
import {
  ForwardForm,
  ForwardsPanel,
  useForwards,
} from "@/features/forwards";
import {
  AppSidebar,
  AuthCheckDialog,
  DisconnectDialog,
  type DisconnectChoice,
  HostForm,
  HostKeyDialog,
  isLocalHost,
  SessionHeader,
  useHosts,
} from "@/features/hosts";
import type { Host, HostConfig } from "@/features/hosts/types";
import type { PortForwardConfig } from "@/features/forwards/types";
import { FileDiscardDialog } from "@/features/files/components/file-discard-dialog";
import { FileWorkspace } from "@/features/files/components/file-workspace";
import { FileTreeSidebar } from "@/features/files/components/file-tree-sidebar";
import { FilesWorkspace } from "@/features/files/components/files-workspace";
import { useFiles } from "@/features/files/use-files";
import {
  HostsPage,
  ProjectForm,
  ProjectsPage,
  WorkspaceRecents,
  adhocWorkspaceId,
  parseWorkspaceId,
  projectWorkspaceId,
  scopeLabel,
  useProjects,
  type ProjectConfig,
  type WorkspaceId,
  type WorkspaceScope,
} from "@/features/projects";
import {
  useSessionTabShortcuts,
  useSessionTabs,
  type SessionTab,
} from "@/features/session-tabs";
import {
  DEFAULT_TMUX_SESSION,
  TerminalHost,
  useActiveShellFallback,
  useShells,
  type LiveTerminal,
} from "@/features/shells";
import { useIsMobileOs } from "@/features/shells/lib/mobile-os";
import type { FsEntry } from "@/features/ssh";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSidebarWidth } from "@/hooks/use-sidebar-width";

function App() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isMobileOs = useIsMobileOs();
  const showWindowChrome = !isMobileOs;
  const useTitlebarSessionChrome = showWindowChrome && isDesktop;
  const sidebarWidth = useSidebarWidth();
  const forwards = useForwards();
  const shells = useShells();
  const sessionTabs = useSessionTabs();
  const projects = useProjects();
  const [disconnectPrompt, setDisconnectPrompt] = useState<{
    hostId: string;
    sessionName: string;
  } | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<{
    workspaceId: string;
    hostId: string;
    tabId: string;
    fileName: string;
  } | null>(null);

  const sessionTabsRef = useRef(sessionTabs);
  sessionTabsRef.current = sessionTabs;

  const onConnected = useCallback(
    async (host: HostConfig) => {
      await forwards.autoStartForwards(host.id);
      if (host.shellMode === "tmux") {
        await shells.bootstrapTmux(host.id, host.tmuxSession);
      }
    },
    [forwards.autoStartForwards, shells.bootstrapTmux],
  );

  const onDisconnecting = useCallback(
    async (hostId: string) => {
      await shells.clearHostShells(hostId);
      forwards.markHostForwardsIdle(hostId);
      sessionTabsRef.current.clearHost(hostId);
    },
    [forwards.markHostForwardsIdle, shells.clearHostShells],
  );

  const onDeleted = useCallback(
    (hostId: string) => {
      forwards.removeHostForwards(hostId);
      shells.removeHostShells(hostId);
      sessionTabsRef.current.removeHost(hostId);
      void projects.removeHostProjects(hostId);
    },
    [forwards.removeHostForwards, projects.removeHostProjects, shells.removeHostShells],
  );

  const ensureBackgroundReadyRef = useRef<() => Promise<boolean>>(
    async () => true,
  );
  const ensureBackgroundReady = useCallback(
    () => ensureBackgroundReadyRef.current(),
    [],
  );

  const hosts = useHosts({
    onConnected,
    onDisconnecting,
    onDeleted,
    ensureBackgroundReady,
  });

  const connectedCount = useMemo(
    () => hosts.hosts.filter((host) => host.status === "connected").length,
    [hosts.hosts],
  );

  const killAllSessions = useCallback(async () => {
    const connected = hosts.hosts.filter((host) => host.status === "connected");
    for (const host of connected) {
      await hosts.disconnectHost(host.id);
    }
  }, [hosts.disconnectHost, hosts.hosts]);

  const androidBackground = useAndroidBackground({
    connectedCount,
    onKillSessions: killAllSessions,
  });

  ensureBackgroundReadyRef.current = androidBackground.ensureReady;

  const workspaceIdRef = useRef<WorkspaceId | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const workspaceScopeRef = useRef<WorkspaceScope | null>(null);

  const openShell = useCallback(
    async (
      workspaceId: string,
      hostId: string,
      launchId?: Parameters<typeof shells.openShell>[2],
      cwd?: string,
    ) => {
      const host = hosts.hosts.find((item) => item.id === hostId);
      const local = host ? isLocalHost(host) : false;
      try {
        const sessionId = await shells.openShell(workspaceId, hostId, launchId, {
          shellMode: local ? "plain" : host?.shellMode,
          tmuxSession: local ? undefined : host?.tmuxSession,
          cwd,
        });
        if (sessionId) {
          sessionTabsRef.current.activateShellTab(workspaceId, sessionId);
        }
      } catch {
        if (!local) {
          hosts.setHostStatus(hostId, "error", "Failed to open shell");
        }
      }
    },
    [hosts.hosts, hosts.setHostStatus, shells.openShell],
  );

  const selectShell = useCallback(
    (workspaceId: string, hostId: string, sessionId: string) => {
      void shells.selectShell(workspaceId, hostId, sessionId).catch(() => {
        hosts.setHostStatus(hostId, "error", "Failed to attach shell");
      });
    },
    [hosts.setHostStatus, shells.selectShell],
  );

  const requestDisconnect = useCallback(
    (host: Host) => {
      if (host.shellMode === "tmux") {
        setDisconnectPrompt({
          hostId: host.id,
          sessionName: host.tmuxSession?.trim() || DEFAULT_TMUX_SESSION,
        });
        return;
      }
      void hosts.disconnectHost(host.id);
    },
    [hosts.disconnectHost],
  );

  const confirmDisconnect = useCallback(
    async (choice: DisconnectChoice) => {
      if (!disconnectPrompt) return;
      const { hostId, sessionName } = disconnectPrompt;
      setDisconnectBusy(true);
      try {
        if (choice === "kill") {
          try {
            await shells.killTmuxSession(hostId, sessionName);
          } catch {
            // still disconnect the SSH link
          }
        }
        await hosts.disconnectHost(hostId);
        setDisconnectPrompt(null);
      } finally {
        setDisconnectBusy(false);
      }
    },
    [disconnectPrompt, hosts.disconnectHost, shells.killTmuxSession],
  );

  const workspace = useWorkspace({
    onShortcutShell: () => {
      const workspaceId = workspaceIdRef.current;
      const hostId = hostIdRef.current;
      if (!workspaceId || !hostId) return;
      const tabs = sessionTabsRef.current.tabsByWorkspace[workspaceId] ?? [];
      const shellTab = tabs.find((tab) => tab.kind === "shell");
      if (shellTab) {
        sessionTabsRef.current.selectTab(workspaceId, shellTab.id);
        selectShell(workspaceId, hostId, shellTab.shellId);
        return;
      }
      const scope = workspaceScopeRef.current;
      const project =
        scope?.kind === "project"
          ? projects.getProject(hostId, scope.projectId)
          : null;
      void openShell(workspaceId, hostId, undefined, project?.path);
    },
    onShortcutFiles: () => {
      const workspaceId = workspaceIdRef.current;
      if (!workspaceId) return;
      sessionTabsRef.current.openToolTab(workspaceId, "files");
    },
    onShortcutPorts: () => {
      const hostId = hostIdRef.current;
      const workspaceId = workspaceIdRef.current;
      if (!hostId || !workspaceId) return;
      const host = hosts.hosts.find((item) => item.id === hostId);
      if (!host || isLocalHost(host)) return;
      sessionTabsRef.current.openToolTab(workspaceId, "ports");
    },
  });

  workspaceIdRef.current = workspace.workspaceId;
  hostIdRef.current = workspace.hostId;
  workspaceScopeRef.current =
    workspace.page.name === "workspace" ? workspace.page.scope : null;

  const handleBack = useCallback(() => {
    if (androidBackground.setupOpen) {
      return true;
    }
    if (disconnectPrompt && !disconnectBusy) {
      setDisconnectPrompt(null);
      return true;
    }
    if (discardTarget) {
      setDiscardTarget(null);
      return true;
    }
    return workspace.handleBack();
  }, [
    androidBackground.setupOpen,
    disconnectBusy,
    disconnectPrompt,
    discardTarget,
    workspace.handleBack,
  ]);

  useAndroidBack({ handleBack });

  useBoot({
    setHosts: hosts.setHosts,
    loadForwards: forwards.loadForwards,
    loadProjects: projects.loadProjects,
    setBooting: hosts.setBooting,
  });

  useSshLifecycle({
    setHostStatus: hosts.setHostStatus,
    markHostForwardsIdle: forwards.markHostForwardsIdle,
    markForwardClosed: forwards.markForwardClosed,
    markForwardError: forwards.markForwardError,
    handleChannelClosed: shells.handleChannelClosed,
    clearSessionsForHost: shells.clearSessionsForHost,
    clearTabsForHost: sessionTabs.clearHost,
  });

  const selectedHost = useMemo(() => {
    if (!workspace.hostId) return null;
    return hosts.hosts.find((host) => host.id === workspace.hostId) ?? null;
  }, [hosts.hosts, workspace.hostId]);

  useEffect(() => {
    const pageName = workspace.page.name;
    const pageHostId = workspace.hostId;
    if (
      (pageName === "projects" ||
        pageName === "workspace" ||
        pageName === "project-form") &&
      pageHostId &&
      !hosts.hosts.some((host) => host.id === pageHostId)
    ) {
      workspace.openHosts();
    }
  }, [
    hosts.hosts,
    workspace.hostId,
    workspace.openHosts,
    workspace.page.name,
  ]);

  const selectedIsLocal = selectedHost ? isLocalHost(selectedHost) : false;
  const activeWorkspaceId = workspace.workspaceId;

  const activeProject = useMemo(() => {
    if (
      workspace.page.name !== "workspace" ||
      workspace.page.scope.kind !== "project" ||
      !selectedHost
    ) {
      return null;
    }
    return projects.getProject(selectedHost.id, workspace.page.scope.projectId);
  }, [projects, selectedHost, workspace.page]);

  const activeScopeLabel = useMemo(() => {
    if (workspace.page.name !== "workspace") return "Ad hoc";
    return scopeLabel(workspace.page.scope, activeProject?.name);
  }, [activeProject?.name, workspace.page]);

  const projectRootPath =
    workspace.page.name === "workspace" &&
    workspace.page.scope.kind === "project"
      ? (activeProject?.path ?? null)
      : null;

  useActiveShellFallback(
    activeWorkspaceId,
    selectedHost?.id ?? null,
    shells.sessionsByWorkspace,
    shells.activeSessionByWorkspace,
    selectShell,
  );

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const tabs = sessionTabs.tabsByWorkspace[activeWorkspaceId] ?? [];
    if (tabs.length === 0) return;
    const activeId =
      sessionTabs.activeTabByWorkspace[activeWorkspaceId] ?? null;
    if (activeId && tabs.some((tab) => tab.id === activeId)) return;
    sessionTabs.selectTab(activeWorkspaceId, tabs[0].id);
    const tab = tabs[0];
    if (tab.kind === "shell" && selectedHost) {
      selectShell(activeWorkspaceId, selectedHost.id, tab.shellId);
    }
  }, [
    activeWorkspaceId,
    selectShell,
    selectedHost,
    sessionTabs.activeTabByWorkspace,
    sessionTabs.selectTab,
    sessionTabs.tabsByWorkspace,
  ]);

  useEffect(() => {
    for (const [workspaceId, sessions] of Object.entries(
      shells.sessionsByWorkspace,
    )) {
      sessionTabs.syncShellTabs(
        workspaceId,
        sessions.map((session) => session.id),
      );
    }
  }, [sessionTabs.syncShellTabs, shells.sessionsByWorkspace]);

  useEffect(() => {
    for (const [workspaceId, activeShellId] of Object.entries(
      shells.activeSessionByWorkspace,
    )) {
      if (!activeShellId) continue;
      const tabs = sessionTabs.tabsByWorkspace[workspaceId] ?? [];
      const activeTabId = sessionTabs.activeTabByWorkspace[workspaceId];
      if (activeTabId) continue;
      if (
        !tabs.some(
          (tab) => tab.kind === "shell" && tab.shellId === activeShellId,
        )
      ) {
        continue;
      }
      sessionTabs.activateShellTab(workspaceId, activeShellId);
    }
  }, [
    sessionTabs.activateShellTab,
    sessionTabs.activeTabByWorkspace,
    sessionTabs.tabsByWorkspace,
    shells.activeSessionByWorkspace,
  ]);

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
    workspace.page.name === "workspace" &&
    selectedHost != null &&
    !workspace.forwardFormMode;

  const explorerChromeOpen =
    inWorkspace &&
    (activeTab?.kind === "files" || activeTab?.kind === "file");

  const portsChromeOpen =
    inWorkspace &&
    !selectedIsLocal &&
    activeTab?.kind === "ports";

  // Shell is the fallback surface so a stale/missing active tab never blanks the page.
  const shellChromeOpen =
    inWorkspace && !explorerChromeOpen && !portsChromeOpen;

  const files = useFiles({
    hostId: selectedHost?.id ?? "__none__",
    connected: selectedHost?.status === "connected",
    enabled: inWorkspace,
    shellCwd: projectRootPath ? null : activeShellCwd,
    rootPath: projectRootPath,
    tmuxSession:
      selectedIsLocal || !selectedHost || projectRootPath
        ? undefined
        : (trackedSession?.tmuxSession ?? selectedHost.tmuxSession),
    tmuxWindowId:
      selectedIsLocal || !selectedHost || projectRootPath
        ? undefined
        : trackedSession?.tmuxWindowId,
  });

  const showFileRail =
    isDesktop &&
    inWorkspace &&
    selectedHost != null &&
    selectedHost.status === "connected";

  const liveTerminals = useMemo(() => {
    const list: LiveTerminal[] = [];
    for (const [workspaceId, sessions] of Object.entries(
      shells.sessionsByWorkspace,
    )) {
      const hostId = sessions[0]?.hostId ?? parseWorkspaceId(workspaceId)?.hostId;
      if (!hostId) continue;
      const host = hosts.hosts.find((item) => item.id === hostId);
      if (!host) continue;
      for (const session of sessions) {
        if (!session.channelId) continue;
        list.push({ workspaceId, host, session });
      }
    }
    return list;
  }, [hosts.hosts, shells.sessionsByWorkspace]);

  const shellActiveSessionId = useMemo(() => {
    if (!activeWorkspaceId) return null;
    if (activeTab?.kind === "shell") return activeTab.shellId;
    return activeSessionId;
  }, [activeSessionId, activeTab, activeWorkspaceId]);

  const openWorkspaceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [workspaceId, sessions] of Object.entries(
      shells.sessionsByWorkspace,
    )) {
      if (sessions.length > 0) ids.add(workspaceId);
    }
    for (const [workspaceId, tabs] of Object.entries(
      sessionTabs.tabsByWorkspace,
    )) {
      if (tabs.length > 0) ids.add(workspaceId);
    }
    return ids;
  }, [sessionTabs.tabsByWorkspace, shells.sessionsByWorkspace]);

  const selectSessionTab = useCallback(
    (tabId: string) => {
      if (!selectedHost || !activeWorkspaceId) return;
      sessionTabs.selectTab(activeWorkspaceId, tabId);
      const tab = (
        sessionTabs.tabsByWorkspace[activeWorkspaceId] ?? []
      ).find((item) => item.id === tabId);
      if (tab?.kind === "shell") {
        selectShell(activeWorkspaceId, selectedHost.id, tab.shellId);
      }
    },
    [activeWorkspaceId, selectedHost, selectShell, sessionTabs],
  );

  const closeSessionTab = useCallback(
    (tabId: string) => {
      if (!selectedHost || !activeWorkspaceId) return;
      const tab = (
        sessionTabs.tabsByWorkspace[activeWorkspaceId] ?? []
      ).find((item) => item.id === tabId);
      if (!tab) return;

      if (tab.kind === "shell") {
        void shells.closeShell(
          activeWorkspaceId,
          selectedHost.id,
          tab.shellId,
        );
        return;
      }

      const result = sessionTabs.closeTab(activeWorkspaceId, tabId);
      if (!result.closed && result.dirty && result.tab?.kind === "file") {
        setDiscardTarget({
          workspaceId: activeWorkspaceId,
          hostId: selectedHost.id,
          tabId,
          fileName: result.tab.name,
        });
      }
    },
    [activeWorkspaceId, selectedHost, sessionTabs, shells],
  );

  const confirmDiscardTab = useCallback(() => {
    if (!discardTarget) return;
    const { workspaceId, tabId } = discardTarget;
    sessionTabs.closeTab(workspaceId, tabId, { force: true });
    setDiscardTarget(null);
  }, [discardTarget, sessionTabs]);

  useSessionTabShortcuts({
    enabled: inWorkspace,
    tabs: selectedTabs,
    activeId: activeTabId,
    onSelect: selectSessionTab,
  });

  const selectedForwards = selectedHost
    ? (forwards.forwardsByHost[selectedHost.id] ?? [])
    : [];

  const page = workspace.page;

  const editingHost =
    page.name === "host-form" && page.mode === "edit" && page.hostId
      ? (hosts.hosts.find((host) => host.id === page.hostId) ?? null)
      : null;

  const editingProject =
    page.name === "project-form" && page.mode === "edit" && page.projectId
      ? projects.getProject(page.hostId, page.projectId)
      : null;

  const forwardFormMode = workspace.forwardFormMode;
  const editingForward =
    forwardFormMode?.type === "edit"
      ? (selectedForwards.find(
          (forward) => forward.id === forwardFormMode.id,
        ) ?? null)
      : null;

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
    if (
      workspace.page.name !== "workspace" ||
      workspace.page.scope.kind !== "adhoc"
    ) {
      return;
    }
    const path =
      activeShellCwd?.trim() ||
      files.path?.trim() ||
      "";
    if (!path || path === ".") return;
    workspace.openAddProject(selectedHost.id, {
      initialPath: path,
      migrateFromAdhoc: true,
    });
  }, [
    activeShellCwd,
    files.path,
    selectedHost,
    workspace,
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
      sessionTabs,
      shells,
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
      sessionTabs,
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

  const handleOpenFile = useCallback(
    (entry: FsEntry) => {
      if (!selectedHost || !activeWorkspaceId) return;
      void sessionTabs.openFileTab(activeWorkspaceId, selectedHost.id, entry);
    },
    [activeWorkspaceId, selectedHost, sessionTabs],
  );

  const handleOpenShell = useCallback(
    (launchId?: Parameters<typeof shells.openShell>[2]) => {
      if (!selectedHost || !activeWorkspaceId) return;
      void openShell(
        activeWorkspaceId,
        selectedHost.id,
        launchId,
        projectRootPath ?? undefined,
      );
    },
    [activeWorkspaceId, openShell, projectRootPath, selectedHost],
  );

  const openFileTabs = useMemo(() => {
    return selectedTabs.filter(
      (tab): tab is Extract<SessionTab, { kind: "file" }> => tab.kind === "file",
    );
  }, [selectedTabs]);

  const projectsHost =
    page.name === "projects" || page.name === "project-form"
      ? (hosts.hosts.find((host) => host.id === page.hostId) ?? null)
      : null;

  if (hosts.booting) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading hosts…
      </div>
    );
  }

  const sessionTabBar =
    inWorkspace && selectedHost?.status === "connected" ? (
      <SessionTabBar
        tabs={selectedTabs}
        activeId={activeTabId}
        shells={selectedSessions}
        files={selectedFiles}
        showPorts={!selectedIsLocal}
        onSelect={selectSessionTab}
        onClose={closeSessionTab}
        onRenameShell={(shellId, name) =>
          shells.renameShell(activeWorkspaceId!, shellId, name)
        }
        onReorder={(orderedIds) =>
          sessionTabs.reorderTabs(activeWorkspaceId!, orderedIds)
        }
        onNewShell={(launchId) => handleOpenShell(launchId)}
        onOpenFiles={() =>
          sessionTabs.openToolTab(activeWorkspaceId!, "files")
        }
        onOpenPorts={() =>
          sessionTabs.openToolTab(activeWorkspaceId!, "ports")
        }
        variant={useTitlebarSessionChrome ? "titlebar" : "default"}
      />
    ) : null;

  const recentsControl = (
    <WorkspaceRecents
      recents={workspace.recents}
      hosts={hosts.hosts}
      projectsByHost={projects.projectsByHost}
      activeWorkspaceId={activeWorkspaceId}
      onSelect={workspace.openRecent}
      onReorder={workspace.reorderRecents}
    />
  );

  const canSaveAdhocProject =
    inWorkspace &&
    selectedHost != null &&
    workspace.page.name === "workspace" &&
    workspace.page.scope.kind === "adhoc" &&
    Boolean(
      (activeShellCwd?.trim() && activeShellCwd.trim() !== ".") ||
        (files.path?.trim() && files.path.trim() !== "."),
    );

  const sessionHeader =
    inWorkspace && selectedHost ? (
      <SessionHeader
        host={selectedHost}
        scopeLabel={activeScopeLabel}
        scopePath={activeProject?.path ?? (canSaveAdhocProject ? activeShellCwd ?? files.path : null)}
        connecting={hosts.connectingId === selectedHost.id}
        onConnect={() => void hosts.connectHost(selectedHost.id)}
        onDisconnect={() => requestDisconnect(selectedHost)}
        onEdit={() => workspace.openEditHost(selectedHost.id)}
        onBack={workspace.handleBack}
        onSaveProject={
          canSaveAdhocProject ? handleSaveAdhocAsProject : undefined
        }
        leadingExtra={recentsControl}
        variant={useTitlebarSessionChrome ? "titlebar" : "default"}
      />
    ) : null;

  return (
    <TooltipProvider>
      <SidebarProvider
        className="h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
        style={
          {
            "--sidebar-width": sidebarWidth.widthCss,
            "--titlebar-height": showWindowChrome ? "2.5rem" : "0px",
          } as CSSProperties
        }
        data-resizing={sidebarWidth.resizing ? "true" : undefined}
        onContextMenu={(event) => event.preventDefault()}
      >
        {showWindowChrome ? (
          <DesktopTitleBar
            showSidebarTrigger={isDesktop && showFileRail}
            trailing={useTitlebarSessionChrome ? sessionHeader : null}
          >
            {useTitlebarSessionChrome ? sessionTabBar : null}
          </DesktopTitleBar>
        ) : null}

        <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
          {showFileRail && selectedHost ? (
            <AppSidebar
              widthPx={sidebarWidth.widthPx}
              onWidthChange={sidebarWidth.setWidthPx}
              onResizeStart={sidebarWidth.beginResize}
              onResizeEnd={sidebarWidth.endResize}
              rootLabel={activeProject?.name ?? selectedHost.name}
              onShowHosts={workspace.openHosts}
            >
              <FileTreeSidebar
                files={files}
                rootLabel={activeProject?.name ?? selectedHost.name}
                selectedPath={
                  activeTab?.kind === "file" ? activeTab.path : null
                }
                onOpenFile={handleOpenFile}
              />
            </AppSidebar>
          ) : null}

          <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {page.name === "hosts" ? (
              <HostsPage
                hosts={hosts.hosts}
                onSelect={workspace.openProjects}
                onAddHost={workspace.openAddHost}
              />
            ) : null}

            {page.name === "projects" ? (
              projectsHost ? (
                <ProjectsPage
                  host={projectsHost}
                  projects={projects.projectsForHost(projectsHost.id)}
                  connecting={hosts.connectingId === projectsHost.id}
                  openWorkspaceIds={openWorkspaceIds}
                  onBack={workspace.openHosts}
                  onOpenAdhoc={() => workspace.openAdhoc(projectsHost.id)}
                  onOpenProject={(projectId) =>
                    workspace.openProject(projectsHost.id, projectId)
                  }
                  onAddProject={() =>
                    workspace.openAddProject(projectsHost.id)
                  }
                  onEditProject={(projectId) =>
                    workspace.openEditProject(projectsHost.id, projectId)
                  }
                  onConnect={() => void hosts.connectHost(projectsHost.id)}
                  onDisconnect={() => requestDisconnect(projectsHost)}
                  onEditHost={() => workspace.openEditHost(projectsHost.id)}
                />
              ) : (
                <HostsPage
                  hosts={hosts.hosts}
                  onSelect={workspace.openProjects}
                  onAddHost={workspace.openAddHost}
                />
              )
            ) : null}

            {page.name === "host-form" ? (
              <HostForm
                initial={editingHost}
                onSave={(config) => void handleSaveHost(config)}
                onCancel={workspace.closeHostForm}
                onDelete={
                  page.mode === "edit" && page.hostId
                    ? (id) => void handleDeleteHost(id)
                    : undefined
                }
              />
            ) : null}

            {page.name === "project-form" && projectsHost ? (
              <ProjectForm
                host={projectsHost}
                initial={editingProject}
                initialPath={
                  page.mode === "add" ? page.initialPath : editingProject?.path
                }
                connecting={hosts.connectingId === projectsHost.id}
                onConnect={() => void hosts.connectHost(projectsHost.id)}
                onSave={(config) => void handleSaveProject(config)}
                onCancel={workspace.closeProjectForm}
                onDelete={
                  page.mode === "edit"
                    ? (id) => void handleDeleteProject(page.hostId, id)
                    : undefined
                }
              />
            ) : null}

            {page.name === "workspace" && !selectedHost ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                Host unavailable
              </div>
            ) : null}

            {page.name === "workspace" && selectedHost ? (
              workspace.forwardFormMode ? (
                <ForwardForm
                  initial={editingForward}
                  onSave={handleSaveForward}
                  onCancel={workspace.closeForwardForm}
                  onDelete={
                    workspace.forwardFormMode.type === "edit"
                      ? (id) => void handleDeleteForward(id)
                      : undefined
                  }
                />
              ) : (
                <>
                  {useTitlebarSessionChrome ? null : sessionHeader}
                  {useTitlebarSessionChrome ? null : sessionTabBar}

                  {portsChromeOpen ? (
                    <ForwardsPanel
                      host={selectedHost}
                      forwards={selectedForwards}
                      onConnect={() => void hosts.connectHost(selectedHost.id)}
                      onAddForward={workspace.openAddForward}
                      onStartForward={(id) => {
                        const forward = selectedForwards.find(
                          (item) => item.id === id,
                        );
                        if (forward) {
                          void forwards.startForward(selectedHost.id, forward);
                        }
                      }}
                      onStopForward={(id) =>
                        void forwards.stopForward(selectedHost.id, id)
                      }
                      onEditForward={workspace.openEditForward}
                      onDeleteForward={(id) => void handleDeleteForward(id)}
                    />
                  ) : null}

                  <div
                    className={
                      explorerChromeOpen
                        ? "flex min-h-0 flex-1 flex-col"
                        : "hidden"
                    }
                    aria-hidden={!explorerChromeOpen}
                  >
                    <FilesWorkspace
                      host={selectedHost}
                      files={files}
                      activeKind={
                        activeTab?.kind === "file" ? "file" : "files"
                      }
                      onConnect={() => void hosts.connectHost(selectedHost.id)}
                      onOpenFile={handleOpenFile}
                      fileSlot={openFileTabs.map((tab) => {
                        const state = selectedFiles[tab.path];
                        if (!state) return null;
                        const active =
                          activeTab?.kind === "file" &&
                          activeTab.path === tab.path;
                        return (
                          <div
                            key={tab.id}
                            className={
                              active
                                ? "flex min-h-0 flex-1 flex-col"
                                : "hidden"
                            }
                            aria-hidden={!active}
                          >
                            <FileWorkspace
                              state={state}
                              onChangeText={(text) =>
                                sessionTabs.setFileText(
                                  activeWorkspaceId!,
                                  tab.path,
                                  text,
                                )
                              }
                              onSave={() =>
                                sessionTabs.saveFile(
                                  activeWorkspaceId!,
                                  selectedHost.id,
                                  tab.path,
                                )
                              }
                              onDownload={() =>
                                void sessionTabs.downloadFile(
                                  activeWorkspaceId!,
                                  selectedHost.id,
                                  tab.path,
                                )
                              }
                              onRevealFiles={() =>
                                sessionTabs.openToolTab(
                                  activeWorkspaceId!,
                                  "files",
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    />
                  </div>
                </>
              )
            ) : null}

            <TerminalHost
              terminals={liveTerminals}
              activeWorkspaceId={activeWorkspaceId}
              activeSessionId={shellActiveSessionId}
              surfaceOpen={shellChromeOpen}
              emptyHost={selectedHost}
              emptyWorkspaceId={activeWorkspaceId}
              onConnect={(hostId) => void hosts.connectHost(hostId)}
              onOpenShell={(workspaceId, hostId, launchId) => {
                const parsed = parseWorkspaceId(workspaceId);
                const root =
                  parsed?.scope.kind === "project"
                    ? projects.getProject(hostId, parsed.scope.projectId)?.path
                    : projectRootPath ?? undefined;
                void openShell(workspaceId, hostId, launchId, root);
              }}
              onSessionCwd={shells.setSessionCwd}
            />
          </SidebarInset>
        </div>

        {hosts.hostKeyError ? (
          <HostKeyDialog
            error={hosts.hostKeyError}
            busy={hosts.connectingId !== null}
            onAccept={() => void hosts.acceptHostKey()}
            onCancel={hosts.cancelHostKey}
          />
        ) : null}

        {hosts.authCheck ? (
          <AuthCheckDialog
            prompt={hosts.authCheck}
            busy={hosts.connectingId !== null}
            onCancel={() => void hosts.cancelAuthCheck()}
          />
        ) : null}

        <DisconnectDialog
          open={disconnectPrompt != null}
          sessionName={disconnectPrompt?.sessionName ?? DEFAULT_TMUX_SESSION}
          busy={disconnectBusy}
          onOpenChange={(open) => {
            if (!open && !disconnectBusy) setDisconnectPrompt(null);
          }}
          onConfirm={(choice) => void confirmDisconnect(choice)}
        />

        <FileDiscardDialog
          open={discardTarget != null}
          fileName={discardTarget?.fileName ?? ""}
          onOpenChange={(open) => {
            if (!open) setDiscardTarget(null);
          }}
          onDiscard={confirmDiscardTab}
        />

        <BackgroundSetupDialog
          open={androidBackground.setupOpen}
          readiness={androidBackground.readiness}
          busy={androidBackground.setupBusy}
          onEnable={() => void androidBackground.enableBackground()}
          onOpenSettings={() => void androidBackground.openBatterySettings()}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
