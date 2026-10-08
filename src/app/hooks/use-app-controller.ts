import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createWorkspaceSessionChrome,
} from "@/app/components/workspace-shell";
import { useAndroidBack } from "@/app/hooks/use-android-back";
import { useBoot } from "@/app/hooks/use-boot";
import { useHostLifecycle } from "@/app/hooks/use-host-lifecycle";
import { useReconnect } from "@/app/hooks/use-reconnect";
import { useSessionBridge } from "@/app/hooks/use-session-bridge";
import { useSshLifecycle } from "@/app/hooks/use-ssh-lifecycle";
import { useWorkspace } from "@/app/hooks/use-workspace";
import { useWorkspaceActions } from "@/app/hooks/use-workspace-actions";
import { useWorkspaceView } from "@/app/hooks/use-workspace-view";
import { useForwards } from "@/features/forwards";
import {
  buildNotificationItems,
  findTabWorkspace,
  goToTab,
  isAppWindowVisible,
  isViewedNotification,
  listenOsNotificationTap,
  sendOsNotification,
  useNotifications,
  useNotifyRelay,
  type NotificationBellProps,
  type NotificationItem,
} from "@/features/notify";
import { useProjects } from "@/features/projects";
import { useSessionTabs } from "@/features/session-tabs";
import { useIsMobileOs, useShells } from "@/features/shells";
import { toastInfoWithAction } from "@/lib/toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSidebarWidth } from "@/hooks/use-sidebar-width";

export function useAppController() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isMobileOs = useIsMobileOs();
  const showWindowChrome = !isMobileOs;
  // Tabs live in the center column, not the title bar, so the left rail
  // and right panel can run the full height of the window.
  const useTitlebarSessionChrome = false;
  const sidebarWidth = useSidebarWidth();
  const sidePanelWidth = useSidebarWidth("relix.sidepanel-width", 320);

  const forwards = useForwards();
  const shells = useShells();
  const sessionTabs = useSessionTabs();
  const projects = useProjects();

  const hostLife = useHostLifecycle({
    forwards,
    shells,
    sessionTabs,
    projects,
  });
  const { hosts, androidBackground } = hostLife;

  const shortcutShellRef = useRef(() => {});
  const shortcutFilesRef = useRef(() => {});
  const shortcutPortsRef = useRef(() => {});
  const shortcutGitRef = useRef(() => {});

  const workspace = useWorkspace({
    onShortcutShell: () => shortcutShellRef.current(),
    onShortcutFiles: () => shortcutFilesRef.current(),
    onShortcutPorts: () => shortcutPortsRef.current(),
    onShortcutGit: () => shortcutGitRef.current(),
  });

  const view = useWorkspaceView({
    page: workspace.page,
    hostId: workspace.hostId,
    workspaceId: workspace.workspaceId,
    forwardFormMode: workspace.forwardFormMode,
    hosts: hosts.hosts,
    openHosts: workspace.openHosts,
    shells,
    sessionTabs,
    projects,
    forwards,
    isDesktop,
    panelTab: workspace.panelTab,
    panelOpen: isDesktop && !workspace.panelCollapsed,
    mobileTool: workspace.mobileTool,
  });

  const workspaceScope =
    workspace.page.name === "workspace" ? workspace.page.scope : null;

  const sessions = useSessionBridge({
    hosts: hosts.hosts,
    shells,
    sessionTabs,
    projects,
    workspaceId: workspace.workspaceId,
    hostId: workspace.hostId,
    workspaceScope,
    selectedHost: view.selectedHost,
    inWorkspace: view.inWorkspace,
    projectRootPath: view.projectRootPath,
  });

  shortcutShellRef.current = sessions.onShortcutShell;

  // Local host dials the relay directly (no SSH forward); remotes tunnel.
  const connectedHostIds = useMemo(
    () =>
      hosts.hosts
        .filter((host) => host.status === "connected")
        .map((host) => host.id),
    [hosts.hosts],
  );

  const notifications = useNotifications();
  const tabsByWorkspaceRef = useRef(sessionTabs.tabsByWorkspace);
  tabsByWorkspaceRef.current = sessionTabs.tabsByWorkspace;
  const activeWorkspaceRef = useRef(view.activeWorkspaceId);
  activeWorkspaceRef.current = view.activeWorkspaceId;
  const activeTabRef = useRef(view.activeTabId);
  activeTabRef.current = view.activeTabId;

  const openNotificationTab = useCallback(
    (tabId: string) => {
      const moved = goToTab(
        {
          openWorkspace: workspace.openWorkspace,
          selectTab: sessionTabs.selectTab,
          selectShell: (targetWorkspaceId, targetHostId, shellId) => {
            void shells
              .selectShell(targetWorkspaceId, targetHostId, shellId)
              .catch(() => {});
          },
        },
        tabsByWorkspaceRef.current,
        tabId,
      );
      if (moved) notifications.resolve(tabId);
      return moved;
    },
    [
      notifications.resolve,
      sessionTabs.selectTab,
      shells.selectShell,
      workspace.openWorkspace,
    ],
  );

  const handleNotify = useCallback(
    (payload: { id: string; tabId: string; title?: string; body?: string }, hostId: string) => {
      const found = findTabWorkspace(
        tabsByWorkspaceRef.current,
        payload.tabId,
      );
      const viewed = isViewedNotification({
        tabId: payload.tabId,
        workspaceId: found?.workspaceId ?? null,
        activeWorkspaceId: activeWorkspaceRef.current,
        activeTabId: activeTabRef.current,
        windowVisible: isAppWindowVisible(),
      });
      if (viewed) return;
      notifications.upsert(payload, hostId, found?.workspaceId ?? null);
      const title = payload.title?.trim() || "Host notification";
      const description = payload.body?.trim() || `tab ${payload.tabId}`;
      toastInfoWithAction(title, description, "Open", () =>
        openNotificationTab(payload.tabId),
      );
      void sendOsNotification({ title, body: description, tabId: payload.tabId });
    },
    [notifications.upsert, openNotificationTab],
  );

  useNotifyRelay({ connectedHostIds, onNotify: handleNotify });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenOsNotificationTap(openNotificationTab).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, [openNotificationTab]);

  useEffect(() => {
    notifications.pruneClosedTabs(sessionTabs.tabsByWorkspace);
  }, [notifications.pruneClosedTabs, sessionTabs.tabsByWorkspace]);

  useEffect(() => {
    if (view.activeTabId) notifications.resolve(view.activeTabId);
  }, [notifications.resolve, view.activeTabId, view.activeWorkspaceId]);

  const notificationItems = useMemo(
    () =>
      buildNotificationItems(notifications.entries, {
        tabsByWorkspace: sessionTabs.tabsByWorkspace,
        hosts: hosts.hosts,
        projectsByHost: projects.projectsByHost,
        sessionsByWorkspace: shells.sessionsByWorkspace,
      }),
    [
      notifications.entries,
      sessionTabs.tabsByWorkspace,
      hosts.hosts,
      projects.projectsByHost,
      shells.sessionsByWorkspace,
    ],
  );

  const attentionTabIds = useMemo(() => {
    const activeWorkspaceId = view.activeWorkspaceId;
    if (!activeWorkspaceId) return undefined;
    const ids = notifications.entries
      .filter((entry) => entry.workspaceId === activeWorkspaceId)
      .map((entry) => entry.tabId);
    return ids.length > 0 ? new Set(ids) : undefined;
  }, [notifications.entries, view.activeWorkspaceId]);

  const handleOpenNotification = useCallback(
    (item: NotificationItem) => {
      openNotificationTab(item.tabId);
    },
    [openNotificationTab],
  );

  const notificationCenter: NotificationBellProps = {
    items: notificationItems,
    count: notifications.count,
    onOpen: handleOpenNotification,
    onDismiss: notifications.dismiss,
    onClearAll: notifications.clearAll,
    variant: useTitlebarSessionChrome ? "titlebar" : "default",
  };

  const actions = useWorkspaceActions({
    page: workspace.page,
    selectedHost: view.selectedHost,
    activeWorkspaceId: view.activeWorkspaceId,
    activeShellCwd: view.activeShellCwd,
    filesPath: view.files.path,
    isDesktop,
    hosts,
    forwards,
    shells,
    sessionTabs,
    projects,
    workspace,
  });

  const handleBack = useCallback(() => {
    if (androidBackground.setupOpen) return true;
    if (hostLife.quitPrompt && !hostLife.quitBusy) {
      hostLife.clearQuitPrompt();
      return true;
    }
    if (hostLife.disconnectPrompt && !hostLife.disconnectBusy) {
      hostLife.clearDisconnectPrompt();
      return true;
    }
    if (sessions.discardTarget) {
      sessions.clearDiscardTarget();
      return true;
    }
    if (sessions.shellCloseTarget) {
      sessions.clearShellCloseTarget();
      return true;
    }
    return workspace.handleBack();
  }, [
    androidBackground.setupOpen,
    hostLife.quitPrompt,
    hostLife.quitBusy,
    hostLife.clearQuitPrompt,
    hostLife.disconnectPrompt,
    hostLife.disconnectBusy,
    hostLife.clearDisconnectPrompt,
    sessions.discardTarget,
    sessions.clearDiscardTarget,
    sessions.shellCloseTarget,
    sessions.clearShellCloseTarget,
    workspace.handleBack,
  ]);

  useAndroidBack({ handleBack });

  useReconnect({
    hosts: hosts.hosts,
    connectingId: hosts.connectingId,
    connectHost: (hostId: string) => {
      void hosts.connectHost(hostId);
    },
  });

  useBoot({
    setHosts: hosts.setHosts,
    loadForwards: forwards.loadForwards,
    loadProjects: projects.loadProjects,
    syncHostProjects: projects.syncHostProjects,
    bootstrapLocalTmux: hostLife.bootstrapLocalTmux,
    setBooting: hosts.setBooting,
  });

  useSshLifecycle({
    setHostStatus: hosts.setHostStatus,
    markHostForwardsIdle: forwards.markHostForwardsIdle,
    markHostForwardsReconnecting: forwards.markHostForwardsReconnecting,
    markForwardClosed: forwards.markForwardClosed,
    markForwardError: forwards.markForwardError,
    handleChannelClosed: shells.handleChannelClosed,
    clearSessionsForHost: shells.clearSessionsForHost,
    clearTabsForHost: sessionTabs.clearHost,
    onConnectionLost: hostLife.onConnectionLost,
  });

  const connectHost = useCallback(
    (hostId: string) => {
      void hosts.connectHost(hostId);
    },
    [hosts.connectHost],
  );

  const openPanelOrMobile = useCallback(
    (tab: "files" | "git" | "ports") => {
      if (!view.activeWorkspaceId) return;
      if (isDesktop) {
        workspace.selectPanelTab(tab);
        return;
      }
      workspace.openMobileTool(tab);
    },
    [
      isDesktop,
      view.activeWorkspaceId,
      workspace.selectPanelTab,
      workspace.openMobileTool,
    ],
  );

  const openFilesTab = useCallback(() => {
    openPanelOrMobile("files");
  }, [openPanelOrMobile]);

  const openPortsTab = useCallback(() => {
    if (!view.selectedHost || view.selectedIsLocal) return;
    openPanelOrMobile("ports");
  }, [openPanelOrMobile, view.selectedHost, view.selectedIsLocal]);

  const openGitTab = useCallback(() => {
    openPanelOrMobile("git");
  }, [openPanelOrMobile]);

  shortcutFilesRef.current = openFilesTab;
  shortcutPortsRef.current = openPortsTab;
  shortcutGitRef.current = openGitTab;

  const renameShell = useCallback(
    (shellId: string, name: string) => {
      if (!view.activeWorkspaceId) return;
      shells.renameShell(view.activeWorkspaceId, shellId, name);
    },
    [shells.renameShell, view.activeWorkspaceId],
  );

  const reorderTabs = useCallback(
    (orderedIds: string[]) => {
      if (!view.activeWorkspaceId) return;
      sessionTabs.reorderTabs(view.activeWorkspaceId, orderedIds);
    },
    [sessionTabs.reorderTabs, view.activeWorkspaceId],
  );

  const changeFileText = useCallback(
    (path: string, text: string) => {
      if (!view.activeWorkspaceId) return;
      sessionTabs.setFileText(view.activeWorkspaceId, path, text);
    },
    [sessionTabs.setFileText, view.activeWorkspaceId],
  );

  const saveFile = useCallback(
    async (path: string) => {
      if (!view.selectedHost || !view.activeWorkspaceId) return;
      await sessionTabs.saveFile(
        view.activeWorkspaceId,
        view.selectedHost.id,
        path,
      );
    },
    [sessionTabs.saveFile, view.activeWorkspaceId, view.selectedHost],
  );

  const downloadFile = useCallback(
    (path: string) => {
      if (!view.selectedHost || !view.activeWorkspaceId) return;
      void sessionTabs.downloadFile(
        view.activeWorkspaceId,
        view.selectedHost.id,
        path,
      );
    },
    [sessionTabs.downloadFile, view.activeWorkspaceId, view.selectedHost],
  );

  const startForward = useCallback(
    (hostId: string, forward: Parameters<typeof forwards.startForward>[1]) => {
      void forwards.startForward(hostId, forward);
    },
    [forwards.startForward],
  );

  const stopForward = useCallback(
    (hostId: string, id: string) => {
      void forwards.stopForward(hostId, id);
    },
    [forwards.stopForward],
  );

  const getProjectPath = useCallback(
    (hostId: string, projectId: string, worktreePath?: string | null) => {
      const project = projects.getProject(hostId, projectId);
      if (!project) return undefined;
      const override = worktreePath?.trim();
      if (override) return override;
      return project.path.trim() || undefined;
    },
    [projects.getProject],
  );

  const sessionChrome = useMemo(
    () =>
      createWorkspaceSessionChrome({
        selectedHost: view.selectedHost,
        useTitlebarSessionChrome,
        activeScopeLabel: view.activeScopeLabel,
        canSaveAdhocProject: view.canSaveAdhocProject,
        activeShellCwd: view.activeShellCwd,
        filesPath: view.files.path,
        connecting:
          view.selectedHost != null &&
          hosts.connectingId === view.selectedHost.id,
        inWorkspace: view.inWorkspace,
        selectedTabs: view.selectedTabs,
        activeTabId: view.activeTabId,
        selectedSessions: view.selectedSessions,
        selectedFiles: view.selectedFiles,
        selectedIsLocal: view.selectedIsLocal,
        gitWorktrees: view.activeProject ? view.gitWorktrees : null,
        activeScopeWorktreePath: view.activeScopeWorktreePath,
        projectRootPath: view.projectRootPath,
        onConnect: connectHost,
        onDisconnect: hostLife.requestDisconnect,
        onEditHost: workspace.openEditHost,
        onBack: workspace.handleBack,
        onSaveProject: view.canSaveAdhocProject
          ? actions.handleSaveAdhocAsProject
          : undefined,
        onSelectTab: sessions.selectSessionTab,
        onCloseTab: sessions.closeSessionTab,
        onRenameShell: renameShell,
        onReorderTabs: reorderTabs,
        onNewShell: sessions.handleOpenShell,
        onOpenFiles: openFilesTab,
        onOpenPorts: openPortsTab,
        onOpenGit: openGitTab,
        notificationCenter,
        attentionTabIds,
      }),
    [
      actions.handleSaveAdhocAsProject,
      actions.handleSetProjectWorktree,
      connectHost,
      hostLife.requestDisconnect,
      hosts.connectingId,
      openFilesTab,
      attentionTabIds,
      notificationCenter,
      openGitTab,
      openPortsTab,
      renameShell,
      reorderTabs,
      sessions.closeSessionTab,
      sessions.handleOpenShell,
      sessions.selectSessionTab,
      useTitlebarSessionChrome,
      view.activeProject,
      view.activeScopeLabel,
      view.activeShellCwd,
      view.activeTabId,
      view.canSaveAdhocProject,
      view.files.path,
      view.gitWorktrees,
      view.inWorkspace,
      view.selectedFiles,
      view.selectedHost,
      view.selectedIsLocal,
      view.selectedSessions,
      view.selectedTabs,
      workspace.handleBack,
      workspace.openEditHost,
    ],
  );

  return {
    booting: hosts.booting,
    isDesktop,
    showWindowChrome,
    useTitlebarSessionChrome,
    sidebarWidth,
    sidePanelWidth,
    view,
    workspace,
    hosts,
    hostLife,
    sessions,
    actions,
    projects,
    shells,
    androidBackground,
    sessionChrome,
    notificationCenter,
    connectHost,
    openFilesTab,
    openPortsTab,
    openGitTab,
    renameShell,
    reorderTabs,
    changeFileText,
    saveFile,
    downloadFile,
    startForward,
    stopForward,
    getProjectPath,
  };
}

export type AppController = ReturnType<typeof useAppController>;
