import { useCallback, useMemo } from "react";
import { useAndroidBack } from "@/app/use-android-back";
import { useBoot } from "@/app/use-boot";
import { useSshLifecycle } from "@/app/use-ssh-lifecycle";
import { useWorkspace } from "@/app/use-workspace";
import { EmptyWorkspace } from "@/components/workspace/empty-workspace";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import {
  ForwardForm,
  ForwardsPanel,
  useForwards,
} from "@/features/forwards";
import {
  AuthCheckDialog,
  HostForm,
  HostKeyDialog,
  HostRail,
  SessionHeader,
  useHosts,
} from "@/features/hosts";
import type { HostConfig } from "@/features/hosts/types";
import type { PortForwardConfig } from "@/features/forwards/types";
import { SftpPanel } from "@/features/sftp";
import {
  TerminalPanel,
  useActiveShellFallback,
  useShells,
  useShellTabShortcuts,
} from "@/features/shells";

function App() {
  const forwards = useForwards();
  const shells = useShells();

  const onConnected = useCallback(
    (hostId: string) => forwards.autoStartForwards(hostId),
    [forwards.autoStartForwards],
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

  const hosts = useHosts({
    onConnected,
    onDisconnecting,
    onDeleted,
  });

  const openShell = useCallback(
    async (hostId: string, launchId?: Parameters<typeof shells.openShell>[1]) => {
      try {
        await shells.openShell(hostId, launchId);
      } catch {
        hosts.setHostStatus(hostId, "error", "Failed to open shell");
      }
    },
    [hosts.setHostStatus, shells.openShell],
  );

  const workspace = useWorkspace({ hosts: hosts.hosts });
  useAndroidBack({ handleBack: workspace.handleBack });

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
    removeSession: shells.removeSession,
    clearSessionsForHost: shells.clearSessionsForHost,
  });

  useActiveShellFallback(
    workspace.selectedId,
    shells.sessionsByHost,
    shells.activeSessionByHost,
    shells.selectShell,
  );

  const selectedHost = useMemo(
    () => hosts.hosts.find((host) => host.id === workspace.selectedId) ?? null,
    [hosts.hosts, workspace.selectedId],
  );

  const selectedSessions = selectedHost
    ? (shells.sessionsByHost[selectedHost.id] ?? [])
    : [];
  const activeSessionId = selectedHost
    ? (shells.activeSessionByHost[selectedHost.id] ?? null)
    : null;

  const selectShellTab = useCallback(
    (id: string) => {
      if (selectedHost) shells.selectShell(selectedHost.id, id);
    },
    [selectedHost, shells.selectShell],
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
    <div className="flex h-full overflow-hidden bg-background text-foreground">
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
              onDisconnect={() => void hosts.disconnectHost(selectedHost.id)}
              onEdit={() => workspace.openEditHost(selectedHost.id)}
              onBack={workspace.backToHosts}
            />
            <WorkspaceTabs active={workspace.tab} onChange={workspace.setTab} />
            {workspace.tab === "sftp" ? (
              <SftpPanel
                host={selectedHost}
                onConnect={() => void hosts.connectHost(selectedHost.id)}
              />
            ) : null}
            {workspace.tab === "forwards" ? (
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

        {selectedHost ? (
          <div
            className={
              !workspace.formMode &&
              !workspace.forwardFormMode &&
              workspace.tab === "terminal"
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden"
            }
            aria-hidden={
              workspace.formMode != null ||
              workspace.forwardFormMode != null ||
              workspace.tab !== "terminal"
            }
          >
            <TerminalPanel
              host={selectedHost}
              sessions={selectedSessions}
              activeSessionId={activeSessionId}
              visible={
                !workspace.formMode &&
                !workspace.forwardFormMode &&
                workspace.tab === "terminal"
              }
              onConnect={() => void hosts.connectHost(selectedHost.id)}
              onOpenShell={(launchId) =>
                void openShell(selectedHost.id, launchId)
              }
              onSelectShell={(id) => shells.selectShell(selectedHost.id, id)}
              onCloseShell={(id) => void shells.closeShell(selectedHost.id, id)}
              onSessionCwd={shells.setSessionCwd}
            />
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
    </div>
  );
}

export default App;
