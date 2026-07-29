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
import { EmptyWorkspace } from "@/components/workspace/empty-workspace";
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
  MobileHostPane,
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
  useSessionTabShortcuts,
  useSessionTabs,
  type SessionTab,
} from "@/features/session-tabs";
import {
  DEFAULT_TMUX_SESSION,
  TerminalPanel,
  useActiveShellFallback,
  useShells,
} from "@/features/shells";
import { useIsMobileOs } from "@/features/shells/lib/mobile-os";
import type { FsEntry } from "@/features/ssh";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSidebarWidth } from "@/hooks/use-sidebar-width";

function App() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isMobileOs = useIsMobileOs();
  // Frameless desktop always needs window chrome, even when the layout is narrow.
  const showWindowChrome = !isMobileOs;
  const useTitlebarSessionChrome = showWindowChrome && isDesktop;
  const sidebarWidth = useSidebarWidth();
  const forwards = useForwards();
  const shells = useShells();
  const sessionTabs = useSessionTabs();
  const [railOverride, setRailOverride] = useState<"hosts" | null>(null);
  const [disconnectPrompt, setDisconnectPrompt] = useState<{
    hostId: string;
    sessionName: string;
  } | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<{
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
    },
    [forwards.removeHostForwards, shells.removeHostShells],
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

  const openShell = useCallback(
    async (
      hostId: string,
      launchId?: Parameters<typeof shells.openShell>[1],
    ) => {
      const host = hosts.hosts.find((item) => item.id === hostId);
      const local = host ? isLocalHost(host) : false;
      try {
        const sessionId = await shells.openShell(hostId, launchId, {
          shellMode: local ? "plain" : host?.shellMode,
          tmuxSession: local ? undefined : host?.tmuxSession,
        });
        if (sessionId) {
          sessionTabsRef.current.activateShellTab(hostId, sessionId);
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
    (hostId: string, sessionId: string) => {
      void shells.selectShell(hostId, sessionId).catch(() => {
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

  const selectedIdRef = useRef<string | null>(null);

  const workspace = useWorkspace({
    hosts: hosts.hosts,
    onShortcutShell: () => {
      const hostId = selectedIdRef.current;
      if (!hostId) return;
      const tabs = sessionTabsRef.current.tabsByHost[hostId] ?? [];
      const shellTab = tabs.find((tab) => tab.kind === "shell");
      if (shellTab) {
        sessionTabsRef.current.selectTab(hostId, shellTab.id);
        selectShell(hostId, shellTab.shellId);
        return;
      }
      void openShell(hostId);
    },
    onShortcutFiles: () => {
      const hostId = selectedIdRef.current;
      if (!hostId) return;
      setRailOverride(null);
      sessionTabsRef.current.openToolTab(hostId, "files");
    },
    onShortcutPorts: () => {
      const hostId = selectedIdRef.current;
      if (!hostId) return;
      const host = hosts.hosts.find((item) => item.id === hostId);
      if (!host || isLocalHost(host)) return;
      sessionTabsRef.current.openToolTab(hostId, "ports");
    },
  });

  selectedIdRef.current = workspace.selectedId;

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
    setSelectedId: workspace.setSelectedId,
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

  useActiveShellFallback(
    workspace.selectedId,
    shells.sessionsByHost,
    shells.activeSessionByHost,
    selectShell,
  );

  // Keep shell tabs in sync with shell sessions (tmux reconcile, close, etc.)
  useEffect(() => {
    for (const [hostId, sessions] of Object.entries(shells.sessionsByHost)) {
      sessionTabs.syncShellTabs(
        hostId,
        sessions.map((session) => session.id),
      );
    }
  }, [sessionTabs.syncShellTabs, shells.sessionsByHost]);

  // After tmux bootstrap, focus the active shell tab when nothing else is open.
  useEffect(() => {
    for (const [hostId, activeShellId] of Object.entries(
      shells.activeSessionByHost,
    )) {
      if (!activeShellId) continue;
      const tabs = sessionTabs.tabsByHost[hostId] ?? [];
      const activeTabId = sessionTabs.activeTabByHost[hostId];
      if (activeTabId) continue;
      if (!tabs.some((tab) => tab.kind === "shell" && tab.shellId === activeShellId)) {
        continue;
      }
      sessionTabs.activateShellTab(hostId, activeShellId);
    }
  }, [
    sessionTabs.activateShellTab,
    sessionTabs.activeTabByHost,
    sessionTabs.tabsByHost,
    shells.activeSessionByHost,
  ]);

  const selectedHost = useMemo(
    () => hosts.hosts.find((host) => host.id === workspace.selectedId) ?? null,
    [hosts.hosts, workspace.selectedId],
  );
  const selectedIsLocal = selectedHost ? isLocalHost(selectedHost) : false;

  const selectedSessions = selectedHost
    ? (shells.sessionsByHost[selectedHost.id] ?? [])
    : [];
  const activeSessionId = selectedHost
    ? (shells.activeSessionByHost[selectedHost.id] ?? null)
    : null;
  const activeSession =
    selectedSessions.find((session) => session.id === activeSessionId) ?? null;

  const selectedTabs = selectedHost
    ? (sessionTabs.tabsByHost[selectedHost.id] ?? [])
    : [];
  const activeTabId = selectedHost
    ? (sessionTabs.activeTabByHost[selectedHost.id] ?? null)
    : null;
  const activeTab =
    selectedTabs.find((tab) => tab.id === activeTabId) ?? null;
  const selectedFiles = selectedHost
    ? (sessionTabs.filesByHost[selectedHost.id] ?? {})
    : {};

  const trackedSessionId =
    activeTab?.kind === "shell" ? activeTab.shellId : activeSessionId;
  const trackedSession =
    selectedSessions.find((session) => session.id === trackedSessionId) ??
    activeSession;
  const activeShellCwd = trackedSession?.cwd ?? null;

  // Keep the terminal surface mounted for the empty-tab state too, so a new
  // shell can attach without swapping in a second TerminalPanel.
  const shellChromeOpen =
    !workspace.formMode &&
    !workspace.forwardFormMode &&
    selectedHost != null &&
    (activeTab?.kind === "shell" || selectedTabs.length === 0);

  const explorerChromeOpen =
    !workspace.formMode &&
    !workspace.forwardFormMode &&
    selectedHost != null &&
    (activeTab?.kind === "files" || activeTab?.kind === "file");

  const portsChromeOpen =
    !workspace.formMode &&
    !workspace.forwardFormMode &&
    selectedHost != null &&
    !selectedIsLocal &&
    activeTab?.kind === "ports";

  const files = useFiles({
    hostId: selectedHost?.id ?? "__none__",
    connected: selectedHost?.status === "connected",
    enabled: selectedHost != null,
    shellCwd: activeShellCwd,
    tmuxSession:
      selectedIsLocal || !selectedHost
        ? undefined
        : (trackedSession?.tmuxSession ?? selectedHost.tmuxSession),
    tmuxWindowId:
      selectedIsLocal || !selectedHost
        ? undefined
        : trackedSession?.tmuxWindowId,
  });

  useEffect(() => {
    setRailOverride(null);
  }, [selectedHost?.id]);

  const showFileRail =
    isDesktop &&
    !workspace.formMode &&
    !workspace.forwardFormMode &&
    selectedHost != null &&
    selectedHost.status === "connected" &&
    railOverride !== "hosts";

  // Keep panels mounted across host switches so xterm scrollback and WebGL
  // surfaces survive. Only the selected host is shown.
  const terminalHosts = useMemo(() => {
    return hosts.hosts.filter((host) => {
      if (selectedHost?.id === host.id) return true;
      return (shells.sessionsByHost[host.id] ?? []).length > 0;
    });
  }, [hosts.hosts, selectedHost?.id, shells.sessionsByHost]);

  const selectSessionTab = useCallback(
    (tabId: string) => {
      if (!selectedHost) return;
      sessionTabs.selectTab(selectedHost.id, tabId);
      const tab = (sessionTabs.tabsByHost[selectedHost.id] ?? []).find(
        (item) => item.id === tabId,
      );
      if (tab?.kind === "shell") {
        selectShell(selectedHost.id, tab.shellId);
      }
      if (tab?.kind === "files" || tab?.kind === "file") {
        setRailOverride(null);
      }
    },
    [selectedHost, selectShell, sessionTabs],
  );

  const closeSessionTab = useCallback(
    (tabId: string) => {
      if (!selectedHost) return;
      const tab = (sessionTabs.tabsByHost[selectedHost.id] ?? []).find(
        (item) => item.id === tabId,
      );
      if (!tab) return;

      // Shell tabs are removed via session sync after the PTY closes.
      if (tab.kind === "shell") {
        void shells.closeShell(selectedHost.id, tab.shellId);
        return;
      }

      const result = sessionTabs.closeTab(selectedHost.id, tabId);
      if (!result.closed && result.dirty && result.tab?.kind === "file") {
        setDiscardTarget({
          hostId: selectedHost.id,
          tabId,
          fileName: result.tab.name,
        });
      }
    },
    [selectedHost, sessionTabs, shells],
  );

  const confirmDiscardTab = useCallback(() => {
    if (!discardTarget) return;
    const { hostId, tabId } = discardTarget;
    const result = sessionTabs.closeTab(hostId, tabId, { force: true });
    setDiscardTarget(null);
    if (result.closed && result.tab?.kind === "shell") {
      void shells.closeShell(hostId, result.tab.shellId);
    }
  }, [discardTarget, sessionTabs, shells]);

  useSessionTabShortcuts({
    enabled:
      selectedHost != null &&
      !workspace.formMode &&
      !workspace.forwardFormMode,
    tabs: selectedTabs,
    activeId: activeTabId,
    onSelect: selectSessionTab,
  });

  const selectedForwards = selectedHost
    ? (forwards.forwardsByHost[selectedHost.id] ?? [])
    : [];
  const formMode = workspace.formMode;
  const forwardFormMode = workspace.forwardFormMode;
  const editingHost =
    formMode?.type === "edit"
      ? (hosts.hosts.find((host) => host.id === formMode.id) ?? null)
      : null;
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

  const handleSaveForward = useCallback(
    (config: PortForwardConfig) => {
      if (!selectedHost) return;
      forwards.saveForward(selectedHost.id, config);
      workspace.afterSaveForward();
      sessionTabs.openToolTab(selectedHost.id, "ports");
    },
    [forwards.saveForward, selectedHost, sessionTabs, workspace.afterSaveForward],
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
      if (!selectedHost) return;
      void sessionTabs.openFileTab(selectedHost.id, entry);
    },
    [selectedHost, sessionTabs],
  );

  const showSession =
    workspace.mobilePane === "session" ? "flex" : "hidden md:flex";
  const showMobileHosts = workspace.mobilePane === "hosts";

  const openFileTabs = useMemo(() => {
    return selectedTabs.filter(
      (tab): tab is Extract<SessionTab, { kind: "file" }> => tab.kind === "file",
    );
  }, [selectedTabs]);

  if (hosts.booting) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading hosts…
      </div>
    );
  }

  const sessionActive =
    selectedHost != null &&
    !workspace.formMode &&
    !workspace.forwardFormMode;

  const sessionTabBar =
    sessionActive && selectedHost?.status === "connected" ? (
      <SessionTabBar
        tabs={selectedTabs}
        activeId={activeTabId}
        shells={selectedSessions}
        files={selectedFiles}
        showPorts={!selectedIsLocal}
        onSelect={selectSessionTab}
        onClose={closeSessionTab}
        onRenameShell={(shellId, name) =>
          shells.renameShell(selectedHost.id, shellId, name)
        }
        onReorder={(orderedIds) =>
          sessionTabs.reorderTabs(selectedHost.id, orderedIds)
        }
        onNewShell={(launchId) => void openShell(selectedHost.id, launchId)}
        onOpenFiles={() => {
          setRailOverride(null);
          sessionTabs.openToolTab(selectedHost.id, "files");
        }}
        onOpenPorts={() => sessionTabs.openToolTab(selectedHost.id, "ports")}
        variant={useTitlebarSessionChrome ? "titlebar" : "default"}
      />
    ) : null;

  const sessionHeader = sessionActive && selectedHost ? (
    <SessionHeader
      host={selectedHost}
      connecting={hosts.connectingId === selectedHost.id}
      onConnect={() => void hosts.connectHost(selectedHost.id)}
      onDisconnect={() => requestDisconnect(selectedHost)}
      onEdit={() => workspace.openEditHost(selectedHost.id)}
      onBack={workspace.backToHosts}
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
            showSidebarTrigger={isDesktop}
            trailing={useTitlebarSessionChrome ? sessionHeader : null}
          >
            {useTitlebarSessionChrome ? sessionTabBar : null}
          </DesktopTitleBar>
        ) : null}

        <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
          {isDesktop && showFileRail && selectedHost ? (
            <AppSidebar
              mode="files"
              widthPx={sidebarWidth.widthPx}
              onWidthChange={sidebarWidth.setWidthPx}
              onResizeStart={sidebarWidth.beginResize}
              onResizeEnd={sidebarWidth.endResize}
              onShowHosts={() => setRailOverride("hosts")}
            >
              <FileTreeSidebar
                files={files}
                rootLabel={selectedHost.name}
                selectedPath={
                  activeTab?.kind === "file" ? activeTab.path : null
                }
                onOpenFile={handleOpenFile}
              />
            </AppSidebar>
          ) : isDesktop ? (
            <AppSidebar
              mode="hosts"
              widthPx={sidebarWidth.widthPx}
              onWidthChange={sidebarWidth.setWidthPx}
              onResizeStart={sidebarWidth.beginResize}
              onResizeEnd={sidebarWidth.endResize}
              hosts={hosts.hosts}
              selectedId={workspace.selectedId}
              onSelect={workspace.selectHost}
              onAddHost={workspace.openAddHost}
            />
          ) : null}

          <MobileHostPane
            hosts={hosts.hosts}
            selectedId={workspace.selectedId}
            onSelect={workspace.selectHost}
            onAddHost={workspace.openAddHost}
            className={showMobileHosts ? "flex md:hidden" : "hidden"}
          />

          <SidebarInset
            className={`min-h-0 min-w-0 overflow-hidden ${showSession}`}
          >
            {workspace.formMode ? (
              <HostForm
                initial={editingHost}
                onSave={(config) => void handleSaveHost(config)}
                onCancel={workspace.closeHostForm}
                onDelete={
                  workspace.formMode.type === "edit"
                    ? (id) => void handleDeleteHost(id)
                    : undefined
                }
              />
            ) : workspace.forwardFormMode && selectedHost ? (
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
            ) : selectedHost ? (
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
                  const forward = selectedForwards.find((item) => item.id === id);
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

            {selectedHost ? (
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
                              selectedHost.id,
                              tab.path,
                              text,
                            )
                          }
                          onSave={() =>
                            sessionTabs.saveFile(selectedHost.id, tab.path)
                          }
                          onDownload={() =>
                            void sessionTabs.downloadFile(
                              selectedHost.id,
                              tab.path,
                            )
                          }
                          onRevealFiles={() =>
                            sessionTabs.openToolTab(selectedHost.id, "files")
                          }
                        />
                      </div>
                    );
                  })}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <EmptyWorkspace onAddHost={workspace.openAddHost} />
          </div>
        )}

        {terminalHosts.length > 0 ? (
          <div
            className={
              shellChromeOpen
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden"
            }
            aria-hidden={!shellChromeOpen}
          >
            {terminalHosts.map((host) => {
              const selected = selectedHost?.id === host.id;
              const sessions = shells.sessionsByHost[host.id] ?? [];
              const hostActiveSessionId =
                shells.activeSessionByHost[host.id] ?? null;
              const hostActiveTabId =
                sessionTabs.activeTabByHost[host.id] ?? null;
              const hostActiveTab = (
                sessionTabs.tabsByHost[host.id] ?? []
              ).find((tab) => tab.id === hostActiveTabId);
              const visibleShellId =
                hostActiveTab?.kind === "shell"
                  ? hostActiveTab.shellId
                  : hostActiveSessionId;

              return (
                <div
                  key={host.id}
                  className={
                    selected
                      ? "flex min-h-0 flex-1 flex-col"
                      : "hidden"
                  }
                  aria-hidden={!selected}
                >
                  <TerminalPanel
                    host={host}
                    sessions={sessions}
                    activeSessionId={visibleShellId}
                    visible={shellChromeOpen && selected}
                    onConnect={() => void hosts.connectHost(host.id)}
                    onOpenShell={(launchId) => void openShell(host.id, launchId)}
                    onSessionCwd={shells.setSessionCwd}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
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
