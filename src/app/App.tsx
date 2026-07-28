import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAndroidBack } from "@/app/use-android-back";
import { useBoot } from "@/app/use-boot";
import { useSshLifecycle } from "@/app/use-ssh-lifecycle";
import { useWorkspace } from "@/app/use-workspace";
import { EmptyWorkspace } from "@/components/workspace/empty-workspace";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
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
  AuthCheckDialog,
  DisconnectDialog,
  type DisconnectChoice,
  HostForm,
  HostKeyDialog,
  HostRail,
  isLocalHost,
  SessionHeader,
  useHosts,
} from "@/features/hosts";
import type { Host, HostConfig } from "@/features/hosts/types";
import type { PortForwardConfig } from "@/features/forwards/types";
import { SftpPanel } from "@/features/sftp";
import {
  DEFAULT_TMUX_SESSION,
  TerminalPanel,
  useActiveShellFallback,
  useShells,
  useShellTabShortcuts,
} from "@/features/shells";

function App() {
  const forwards = useForwards();
  const shells = useShells();
  const [disconnectPrompt, setDisconnectPrompt] = useState<{
    hostId: string;
    sessionName: string;
  } | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);

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
    },
    [forwards.markHostForwardsIdle, shells.clearHostShells],
  );

  const onDeleted = useCallback(
    (hostId: string) => {
      forwards.removeHostForwards(hostId);
      shells.removeHostShells(hostId);
    },
    [forwards.removeHostForwards, shells.removeHostShells],
  );

  const ensureBackgroundReadyRef = useRef<() => Promise<boolean>>(async () => true);
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
        await shells.openShell(hostId, launchId, {
          shellMode: local ? "plain" : host?.shellMode,
          tmuxSession: local ? undefined : host?.tmuxSession,
        });
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

  const requestDisconnect = useCallback((host: Host) => {
    if (host.shellMode === "tmux") {
      setDisconnectPrompt({
        hostId: host.id,
        sessionName: host.tmuxSession?.trim() || DEFAULT_TMUX_SESSION,
      });
      return;
    }
    void hosts.disconnectHost(host.id);
  }, [hosts.disconnectHost]);

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

  const workspace = useWorkspace({ hosts: hosts.hosts });

  const handleBack = useCallback(() => {
    if (androidBackground.setupOpen) {
      return true;
    }
    if (disconnectPrompt && !disconnectBusy) {
      setDisconnectPrompt(null);
      return true;
    }
    return workspace.handleBack();
  }, [
    androidBackground.setupOpen,
    disconnectBusy,
    disconnectPrompt,
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
  });

  useActiveShellFallback(
    workspace.selectedId,
    shells.sessionsByHost,
    shells.activeSessionByHost,
    selectShell,
  );

  const selectedHost = useMemo(
    () => hosts.hosts.find((host) => host.id === workspace.selectedId) ?? null,
    [hosts.hosts, workspace.selectedId],
  );
  const selectedIsLocal = selectedHost ? isLocalHost(selectedHost) : false;

  useEffect(() => {
    if (selectedIsLocal && workspace.tab === "forwards") {
      workspace.setTab("terminal");
    }
  }, [selectedIsLocal, workspace.setTab, workspace.tab]);

  const selectedSessions = selectedHost
    ? (shells.sessionsByHost[selectedHost.id] ?? [])
    : [];
  const activeSessionId = selectedHost
    ? (shells.activeSessionByHost[selectedHost.id] ?? null)
    : null;
  const activeSession =
    selectedSessions.find((session) => session.id === activeSessionId) ?? null;
  const activeShellCwd = activeSession?.cwd ?? null;

  const terminalChromeOpen =
    !workspace.formMode &&
    !workspace.forwardFormMode &&
    workspace.tab === "terminal";

  // Keep panels mounted across host switches so xterm scrollback and WebGL
  // surfaces survive. Only the selected host is shown.
  const terminalHosts = useMemo(() => {
    return hosts.hosts.filter((host) => {
      if (selectedHost?.id === host.id) return true;
      return (shells.sessionsByHost[host.id] ?? []).length > 0;
    });
  }, [hosts.hosts, selectedHost?.id, shells.sessionsByHost]);

  const selectShellTab = useCallback(
    (id: string) => {
      if (selectedHost) selectShell(selectedHost.id, id);
    },
    [selectedHost, selectShell],
  );

  useShellTabShortcuts({
    enabled:
      selectedHost != null &&
      !workspace.formMode &&
      !workspace.forwardFormMode &&
      workspace.tab === "terminal",
    sessions: selectedSessions,
    activeId: activeSessionId,
    onSelect: selectShellTab,
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
    },
    [forwards.saveForward, selectedHost, workspace.afterSaveForward],
  );

  const handleDeleteForward = useCallback(
    async (forwardId: string) => {
      if (!selectedHost) return;
      await forwards.deleteForward(selectedHost.id, forwardId);
      workspace.closeForwardForm();
    },
    [forwards.deleteForward, selectedHost, workspace.closeForwardForm],
  );

  const showHostRail =
    workspace.mobilePane === "hosts" ? "flex" : "hidden md:flex";
  const showSession =
    workspace.mobilePane === "session" ? "flex" : "hidden md:flex";

  if (hosts.booting) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading hosts…
      </div>
    );
  }

  return (
    <div
      className="flex h-full overflow-hidden bg-background text-foreground"
      onContextMenu={(event) => event.preventDefault()}
    >
      <HostRail
        hosts={hosts.hosts}
        selectedId={workspace.selectedId}
        onSelect={workspace.selectHost}
        onAddHost={workspace.openAddHost}
        className={showHostRail}
      />

      <main className={`min-h-0 min-w-0 flex-1 flex-col ${showSession}`}>
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
            <SessionHeader
              host={selectedHost}
              connecting={hosts.connectingId === selectedHost.id}
              onConnect={() => void hosts.connectHost(selectedHost.id)}
              onDisconnect={() => requestDisconnect(selectedHost)}
              onEdit={() => workspace.openEditHost(selectedHost.id)}
              onBack={workspace.backToHosts}
            />
            <WorkspaceTabs
              active={workspace.tab}
              onChange={workspace.setTab}
              tabs={selectedIsLocal ? ["terminal", "sftp"] : undefined}
            />
            {workspace.tab === "sftp" ? (
              <SftpPanel
                host={selectedHost}
                shellCwd={activeShellCwd}
                tmuxSession={
                  selectedIsLocal
                    ? undefined
                    : (activeSession?.tmuxSession ?? selectedHost.tmuxSession)
                }
                tmuxWindowId={
                  selectedIsLocal ? undefined : activeSession?.tmuxWindowId
                }
                onConnect={() => void hosts.connectHost(selectedHost.id)}
              />
            ) : null}
            {!selectedIsLocal && workspace.tab === "forwards" ? (
              <ForwardsPanel
                host={selectedHost}
                forwards={selectedForwards}
                onConnect={() => void hosts.connectHost(selectedHost.id)}
                onAddForward={workspace.openAddForward}
                onStartForward={(id) => {
                  const forward = selectedForwards.find((item) => item.id === id);
                  if (forward) void forwards.startForward(selectedHost.id, forward);
                }}
                onStopForward={(id) =>
                  void forwards.stopForward(selectedHost.id, id)
                }
                onEditForward={workspace.openEditForward}
                onDeleteForward={(id) => void handleDeleteForward(id)}
              />
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
              terminalChromeOpen
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden"
            }
            aria-hidden={!terminalChromeOpen}
          >
            {terminalHosts.map((host) => {
              const selected = selectedHost?.id === host.id;
              const sessions = shells.sessionsByHost[host.id] ?? [];
              const hostActiveSessionId =
                shells.activeSessionByHost[host.id] ?? null;
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
                    activeSessionId={hostActiveSessionId}
                    visible={terminalChromeOpen && selected}
                    onConnect={() => void hosts.connectHost(host.id)}
                    onOpenShell={(launchId) => void openShell(host.id, launchId)}
                    onSelectShell={(id) => selectShell(host.id, id)}
                    onCloseShell={(id) => void shells.closeShell(host.id, id)}
                    onRenameShell={(id, name) =>
                      shells.renameShell(host.id, id, name)
                    }
                    onReorderShells={(orderedIds) =>
                      shells.reorderShells(host.id, orderedIds)
                    }
                    onSessionCwd={shells.setSessionCwd}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </main>

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

      <BackgroundSetupDialog
        open={androidBackground.setupOpen}
        readiness={androidBackground.readiness}
        busy={androidBackground.setupBusy}
        onEnable={() => void androidBackground.enableBackground()}
        onOpenSettings={() => void androidBackground.openBatterySettings()}
      />
    </div>
  );
}

export default App;
