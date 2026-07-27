import { useCallback, useEffect, useMemo, useState } from "react";
import { HostRail } from "@/components/shell/host-rail";
import { SessionHeader } from "@/components/shell/session-header";
import { WorkspaceTabs } from "@/components/shell/workspace-tabs";
import { TerminalPanel } from "@/components/shell/terminal-panel";
import { SftpPanel } from "@/components/shell/sftp-panel";
import { ForwardsPanel } from "@/components/shell/forwards-panel";
import { ForwardForm } from "@/components/shell/forward-form";
import { EmptyWorkspace } from "@/components/shell/empty-workspace";
import { HostForm } from "@/components/shell/host-form";
import { HostKeyDialog } from "@/components/shell/host-key-dialog";
import {
  configsToForwards,
  idleForwards,
  toPortForwardConfig,
} from "@/lib/forwards";
import {
  loadForwardsByHost,
  saveForwardsByHost,
} from "@/lib/forwards-store";
import {
  configsToHosts,
  loadHostConfigs,
  saveHostConfigs,
  toHostConfig,
} from "@/lib/hosts-store";
import {
  listenSshConnectionClosed,
  listenSshForwardClosed,
  listenSshForwardError,
  listenSshShellClosed,
  parseSshError,
  sshCloseShell,
  sshConnect,
  sshDisconnect,
  sshOpenShell,
  sshStartDynamicForward,
  sshStartLocalForward,
  sshStartRemoteForward,
  sshStopForward,
  sshTrustHostKey,
} from "@/lib/ssh";
import {
  nextSessionTitle,
  shellLaunchById,
  type ShellLaunchId,
} from "@/lib/shell-launch";
import type {
  Host,
  HostConfig,
  PortForward,
  PortForwardConfig,
  ShellSession,
  SshCommandError,
  WorkspaceTab,
} from "@/lib/types";

type MobilePane = "hosts" | "session";
type FormMode = { type: "add" } | { type: "edit"; id: string } | null;
type ForwardFormMode = { type: "add" } | { type: "edit"; id: string } | null;

function persistForwardMap(map: Record<string, PortForward[]>) {
  const configs: Record<string, PortForwardConfig[]> = {};
  for (const [hostId, list] of Object.entries(map)) {
    configs[hostId] = list.map(toPortForwardConfig);
  }
  return saveForwardsByHost(configs);
}

function App() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [forwardsByHost, setForwardsByHost] = useState<
    Record<string, PortForward[]>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("terminal");
  const [mobilePane, setMobilePane] = useState<MobilePane>("hosts");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [forwardFormMode, setForwardFormMode] = useState<ForwardFormMode>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [hostKeyError, setHostKeyError] = useState<SshCommandError | null>(null);
  const [pendingTrustHostId, setPendingTrustHostId] = useState<string | null>(
    null,
  );
  const [sessionsByHost, setSessionsByHost] = useState<
    Record<string, ShellSession[]>
  >({});
  const [activeSessionByHost, setActiveSessionByHost] = useState<
    Record<string, string | null>
  >({});
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [configs, savedForwards] = await Promise.all([
        loadHostConfigs(),
        loadForwardsByHost(),
      ]);
      if (cancelled) return;
      setHosts(configsToHosts(configs));
      const forwards: Record<string, PortForward[]> = {};
      for (const config of configs) {
        forwards[config.id] = configsToForwards(savedForwards[config.id] ?? []);
      }
      for (const hostId of Object.keys(savedForwards)) {
        if (!(hostId in forwards)) {
          forwards[hostId] = configsToForwards(savedForwards[hostId] ?? []);
        }
      }
      setForwardsByHost(forwards);
      setSelectedId(configs[0]?.id ?? null);
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markHostForwardsIdle = useCallback((hostId: string) => {
    setForwardsByHost((current) => {
      const list = current[hostId];
      if (!list || list.length === 0) return current;
      return { ...current, [hostId]: idleForwards(list) };
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const unsubs: Array<() => void> = [];

    void (async () => {
      const shellClosed = await listenSshShellClosed((event) => {
        setSessionsByHost((current) => {
          const list = (current[event.hostId] ?? []).filter(
            (s) => s.id !== event.sessionId,
          );
          return { ...current, [event.hostId]: list };
        });
        setActiveSessionByHost((current) => {
          if (current[event.hostId] !== event.sessionId) return current;
          return { ...current, [event.hostId]: null };
        });
      });
      if (disposed) {
        shellClosed();
        return;
      }
      unsubs.push(shellClosed);

      const connectionClosed = await listenSshConnectionClosed((event) => {
        setHosts((current) =>
          current.map((host) =>
            host.id === event.hostId ? { ...host, status: "error" } : host,
          ),
        );
        setSessionsByHost((current) => ({ ...current, [event.hostId]: [] }));
        setActiveSessionByHost((current) => ({
          ...current,
          [event.hostId]: null,
        }));
        markHostForwardsIdle(event.hostId);
      });
      if (disposed) {
        connectionClosed();
        return;
      }
      unsubs.push(connectionClosed);

      const forwardClosed = await listenSshForwardClosed((event) => {
        setForwardsByHost((current) => {
          const list = current[event.hostId];
          if (!list) return current;
          return {
            ...current,
            [event.hostId]: list.map((forward) =>
              forward.id === event.forwardId
                ? {
                    ...toPortForwardConfig(forward),
                    status: "idle" as const,
                    errorMessage: undefined,
                  }
                : forward,
            ),
          };
        });
      });
      if (disposed) {
        forwardClosed();
        return;
      }
      unsubs.push(forwardClosed);

      const forwardError = await listenSshForwardError((event) => {
        setForwardsByHost((current) => {
          const list = current[event.hostId];
          if (!list) return current;
          return {
            ...current,
            [event.hostId]: list.map((forward) =>
              forward.id === event.forwardId
                ? {
                    ...forward,
                    // Keep listening; surface the last connection failure.
                    errorMessage: event.message,
                  }
                : forward,
            ),
          };
        });
      });
      if (disposed) {
        forwardError();
        return;
      }
      unsubs.push(forwardError);
    })();

    return () => {
      disposed = true;
      for (const fn of unsubs) fn();
    };
  }, [markHostForwardsIdle]);

  useEffect(() => {
    if (!selectedId) return;
    const sessions = sessionsByHost[selectedId] ?? [];
    const active = activeSessionByHost[selectedId] ?? null;
    if (!active && sessions[0]) {
      setActiveSessionByHost((current) => ({
        ...current,
        [selectedId]: sessions[0].id,
      }));
    }
  }, [selectedId, sessionsByHost, activeSessionByHost]);

  const selectedHost = useMemo(
    () => hosts.find((host) => host.id === selectedId) ?? null,
    [hosts, selectedId],
  );

  const persistHosts = useCallback(async (next: Host[]) => {
    await saveHostConfigs(next.map(toHostConfig));
  }, []);

  const setHostStatus = useCallback((id: string, status: Host["status"]) => {
    setHosts((current) =>
      current.map((host) => (host.id === id ? { ...host, status } : host)),
    );
  }, []);

  const updateForwardStatus = useCallback(
    (
      hostId: string,
      forwardId: string,
      status: PortForward["status"],
      errorMessage?: string,
    ) => {
      setForwardsByHost((current) => {
        const list = current[hostId];
        if (!list) return current;
        return {
          ...current,
          [hostId]: list.map((forward) =>
            forward.id === forwardId
              ? {
                  ...toPortForwardConfig(forward),
                  status,
                  errorMessage,
                }
              : forward,
          ),
        };
      });
    },
    [],
  );

  const startForward = useCallback(
    async (hostId: string, forward: PortForward) => {
      try {
        if (forward.type === "R") {
          await sshStartRemoteForward({
            hostId,
            forwardId: forward.id,
            localHost: forward.localHost,
            localPort: forward.localPort,
            remoteHost: forward.remoteHost,
            remotePort: forward.remotePort,
          });
        } else if (forward.type === "D") {
          await sshStartDynamicForward({
            hostId,
            forwardId: forward.id,
            localHost: forward.localHost,
            localPort: forward.localPort,
          });
        } else {
          await sshStartLocalForward({
            hostId,
            forwardId: forward.id,
            localHost: forward.localHost,
            localPort: forward.localPort,
            remoteHost: forward.remoteHost,
            remotePort: forward.remotePort,
          });
        }
        updateForwardStatus(hostId, forward.id, "active");
      } catch (error) {
        const parsed = parseSshError(error);
        updateForwardStatus(hostId, forward.id, "error", parsed.message);
      }
    },
    [updateForwardStatus],
  );

  const autoStartForwards = useCallback(
    async (hostId: string) => {
      const list = forwardsByHost[hostId] ?? [];
      const pending = list.filter(
        (forward) => forward.autoStart && forward.status !== "active",
      );
      await Promise.allSettled(
        pending.map((forward) => startForward(hostId, forward)),
      );
    },
    [forwardsByHost, startForward],
  );

  const connectHost = useCallback(
    async (id: string) => {
      const host = hosts.find((item) => item.id === id);
      if (!host) return;
      setConnectingId(id);
      setHostKeyError(null);
      try {
        await sshConnect(host);
        setHostStatus(id, "connected");
        await autoStartForwards(id);
      } catch (error) {
        const parsed = parseSshError(error);
        if (
          parsed.code === "host_key_unknown" ||
          parsed.code === "host_key_changed"
        ) {
          setHostKeyError(parsed);
          setPendingTrustHostId(id);
        } else {
          setHostStatus(id, "error");
        }
      } finally {
        setConnectingId(null);
      }
    },
    [autoStartForwards, hosts, setHostStatus],
  );

  const acceptHostKey = useCallback(async () => {
    if (!hostKeyError || !pendingTrustHostId) return;
    if (
      !hostKeyError.hostname ||
      hostKeyError.port == null ||
      !hostKeyError.algorithm ||
      !hostKeyError.keyBase64
    ) {
      setHostKeyError(null);
      return;
    }
    setConnectingId(pendingTrustHostId);
    try {
      await sshTrustHostKey({
        hostname: hostKeyError.hostname,
        port: hostKeyError.port,
        algorithm: hostKeyError.algorithm,
        keyBase64: hostKeyError.keyBase64,
      });
      setHostKeyError(null);
      const hostId = pendingTrustHostId;
      setPendingTrustHostId(null);
      await connectHost(hostId);
    } catch {
      setHostStatus(pendingTrustHostId, "error");
      setHostKeyError(null);
      setPendingTrustHostId(null);
    } finally {
      setConnectingId(null);
    }
  }, [connectHost, hostKeyError, pendingTrustHostId, setHostStatus]);

  const disconnectHost = useCallback(
    async (id: string) => {
      const sessions = sessionsByHost[id] ?? [];
      for (const session of sessions) {
        try {
          await sshCloseShell(session.id);
        } catch {
          // ignore
        }
      }
      try {
        await sshDisconnect(id);
      } catch {
        // ignore
      }
      setSessionsByHost((current) => ({ ...current, [id]: [] }));
      setActiveSessionByHost((current) => ({ ...current, [id]: null }));
      markHostForwardsIdle(id);
      setHostStatus(id, "idle");
    },
    [markHostForwardsIdle, sessionsByHost, setHostStatus],
  );

  const openShell = useCallback(
    async (hostId: string, launchId: ShellLaunchId = "shell") => {
      const launch = shellLaunchById(launchId);
      const activeId = activeSessionByHost[hostId] ?? null;
      const activeSession = (sessionsByHost[hostId] ?? []).find(
        (session) => session.id === activeId,
      );
      const cwd = activeSession?.cwd;
      try {
        const { sessionId } = await sshOpenShell(hostId, {
          command: launch.command,
          cwd,
        });
        setSessionsByHost((current) => {
          const existing = current[hostId] ?? [];
          const next: ShellSession = {
            id: sessionId,
            hostId,
            title: nextSessionTitle(existing, launch.title),
            cwd,
          };
          return { ...current, [hostId]: [...existing, next] };
        });
        setActiveSessionByHost((current) => ({
          ...current,
          [hostId]: sessionId,
        }));
      } catch {
        setHostStatus(hostId, "error");
      }
    },
    [activeSessionByHost, sessionsByHost, setHostStatus],
  );

  const setSessionCwd = useCallback((sessionId: string, cwd: string) => {
    setSessionsByHost((current) => {
      let changed = false;
      const next: Record<string, ShellSession[]> = {};
      for (const [hostId, sessions] of Object.entries(current)) {
        next[hostId] = sessions.map((session) => {
          if (session.id !== sessionId || session.cwd === cwd) return session;
          changed = true;
          return { ...session, cwd };
        });
      }
      return changed ? next : current;
    });
  }, []);

  const closeShell = useCallback(async (hostId: string, sessionId: string) => {
    try {
      await sshCloseShell(sessionId);
    } catch {
      // still remove locally
    }
    setSessionsByHost((current) => ({
      ...current,
      [hostId]: (current[hostId] ?? []).filter((s) => s.id !== sessionId),
    }));
    setActiveSessionByHost((current) => {
      if (current[hostId] !== sessionId) return current;
      return { ...current, [hostId]: null };
    });
  }, []);

  const selectHost = useCallback((id: string) => {
    setSelectedId(id);
    setFormMode(null);
    setForwardFormMode(null);
    setMobilePane("session");
  }, []);

  const backToHosts = useCallback(() => {
    setMobilePane("hosts");
    setFormMode(null);
    setForwardFormMode(null);
  }, []);

  const saveHost = useCallback(
    async (config: HostConfig) => {
      setHosts((current) => {
        const exists = current.some((host) => host.id === config.id);
        const next = exists
          ? current.map((host) =>
              host.id === config.id
                ? { ...config, status: host.status }
                : host,
            )
          : [...current, { ...config, status: "idle" as const }];
        void persistHosts(next);
        return next;
      });
      setForwardsByHost((current) => {
        if (current[config.id]) return current;
        const next = { ...current, [config.id]: [] };
        void persistForwardMap(next);
        return next;
      });
      setSelectedId(config.id);
      setFormMode(null);
      setForwardFormMode(null);
      setTab("terminal");
      setMobilePane("session");
    },
    [persistHosts],
  );

  const deleteHost = useCallback(
    async (id: string) => {
      await disconnectHost(id);
      setHosts((current) => {
        const next = current.filter((host) => host.id !== id);
        void persistHosts(next);
        return next;
      });
      setForwardsByHost((current) => {
        const next = { ...current };
        delete next[id];
        void persistForwardMap(next);
        return next;
      });
      setSessionsByHost((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setSelectedId((current) => (current === id ? null : current));
      setFormMode(null);
      setForwardFormMode(null);
      setMobilePane("hosts");
    },
    [disconnectHost, persistHosts],
  );

  const saveForward = useCallback(
    (config: PortForwardConfig) => {
      if (!selectedHost) return;
      setForwardsByHost((current) => {
        const list = current[selectedHost.id] ?? [];
        const exists = list.some((forward) => forward.id === config.id);
        const nextList: PortForward[] = exists
          ? list.map((forward) =>
              forward.id === config.id
                ? {
                    ...config,
                    status:
                      forward.status === "active"
                        ? ("active" as const)
                        : ("idle" as const),
                    errorMessage: undefined,
                  }
                : forward,
            )
          : [...list, { ...config, status: "idle" as const }];
        const next = { ...current, [selectedHost.id]: nextList };
        void persistForwardMap(next);
        return next;
      });
      setForwardFormMode(null);
      setTab("forwards");
    },
    [selectedHost],
  );

  const deleteForward = useCallback(
    async (forwardId: string) => {
      if (!selectedHost) return;
      const existing = (forwardsByHost[selectedHost.id] ?? []).find(
        (forward) => forward.id === forwardId,
      );
      if (existing?.status === "active") {
        try {
          await sshStopForward(forwardId);
        } catch {
          // still remove locally
        }
      }
      setForwardsByHost((current) => {
        const next = {
          ...current,
          [selectedHost.id]: (current[selectedHost.id] ?? []).filter(
            (forward) => forward.id !== forwardId,
          ),
        };
        void persistForwardMap(next);
        return next;
      });
      setForwardFormMode(null);
    },
    [forwardsByHost, selectedHost],
  );

  const stopForward = useCallback(
    async (hostId: string, forwardId: string) => {
      try {
        await sshStopForward(forwardId);
        updateForwardStatus(hostId, forwardId, "idle");
      } catch (error) {
        const parsed = parseSshError(error);
        if (parsed.code === "not_found") {
          updateForwardStatus(hostId, forwardId, "idle");
          return;
        }
        updateForwardStatus(hostId, forwardId, "error", parsed.message);
      }
    },
    [updateForwardStatus],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "1") {
        setTab("terminal");
        return;
      }
      if (event.key === "2") {
        setTab("sftp");
        return;
      }
      if (event.key === "3") {
        setTab("forwards");
        return;
      }

      if (event.key === "Escape" && mobilePane === "session") {
        if (forwardFormMode) {
          setForwardFormMode(null);
          return;
        }
        setMobilePane("hosts");
        setFormMode(null);
        return;
      }

      if (event.key !== "j" && event.key !== "k") return;
      if (hosts.length === 0) return;

      const currentIndex = Math.max(
        0,
        hosts.findIndex((host) => host.id === selectedId),
      );
      const delta = event.key === "j" ? 1 : -1;
      const nextIndex = Math.min(
        hosts.length - 1,
        Math.max(0, currentIndex + delta),
      );
      setSelectedId(hosts[nextIndex].id);
      setFormMode(null);
      setForwardFormMode(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hosts, selectedId, mobilePane, forwardFormMode]);

  const showHostRail =
    mobilePane === "hosts" ? "flex" : "hidden md:flex";
  const showSession =
    mobilePane === "session" ? "flex" : "hidden md:flex";

  if (booting) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading hosts…
      </div>
    );
  }

  const selectedSessions = selectedHost
    ? (sessionsByHost[selectedHost.id] ?? [])
    : [];
  const activeSessionId = selectedHost
    ? (activeSessionByHost[selectedHost.id] ?? null)
    : null;
  const selectedForwards = selectedHost
    ? (forwardsByHost[selectedHost.id] ?? [])
    : [];
  const editingHost =
    formMode?.type === "edit"
      ? (hosts.find((host) => host.id === formMode.id) ?? null)
      : null;
  const editingForward =
    forwardFormMode?.type === "edit"
      ? (selectedForwards.find((forward) => forward.id === forwardFormMode.id) ??
        null)
      : null;

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <HostRail
        hosts={hosts}
        selectedId={selectedId}
        onSelect={selectHost}
        onAddHost={() => {
          setFormMode({ type: "add" });
          setForwardFormMode(null);
          setMobilePane("session");
        }}
        className={showHostRail}
      />

      <main className={`min-w-0 flex-1 flex-col ${showSession}`}>
        {formMode ? (
          <HostForm
            initial={editingHost}
            onSave={saveHost}
            onCancel={() => setFormMode(null)}
            onDelete={formMode.type === "edit" ? deleteHost : undefined}
          />
        ) : forwardFormMode && selectedHost ? (
          <ForwardForm
            initial={editingForward}
            onSave={saveForward}
            onCancel={() => setForwardFormMode(null)}
            onDelete={
              forwardFormMode.type === "edit"
                ? (id) => void deleteForward(id)
                : undefined
            }
          />
        ) : selectedHost ? (
          <>
            <SessionHeader
              host={selectedHost}
              connecting={connectingId === selectedHost.id}
              onConnect={() => void connectHost(selectedHost.id)}
              onDisconnect={() => void disconnectHost(selectedHost.id)}
              onEdit={() =>
                setFormMode({ type: "edit", id: selectedHost.id })
              }
              onBack={backToHosts}
            />
            <WorkspaceTabs active={tab} onChange={setTab} />
            {tab === "sftp" ? (
              <SftpPanel
                host={selectedHost}
                onConnect={() => void connectHost(selectedHost.id)}
              />
            ) : null}
            {tab === "forwards" ? (
              <ForwardsPanel
                host={selectedHost}
                forwards={selectedForwards}
                onConnect={() => void connectHost(selectedHost.id)}
                onAddForward={() => setForwardFormMode({ type: "add" })}
                onStartForward={(id) => {
                  const forward = selectedForwards.find((item) => item.id === id);
                  if (forward) void startForward(selectedHost.id, forward);
                }}
                onStopForward={(id) =>
                  void stopForward(selectedHost.id, id)
                }
                onEditForward={(id) =>
                  setForwardFormMode({ type: "edit", id })
                }
                onDeleteForward={(id) => void deleteForward(id)}
              />
            ) : null}
          </>
        ) : (
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <EmptyWorkspace
              onAddHost={() => setFormMode({ type: "add" })}
            />
          </div>
        )}

        {selectedHost ? (
          <div
            className={
              !formMode && !forwardFormMode && tab === "terminal"
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden"
            }
            aria-hidden={
              formMode != null || forwardFormMode != null || tab !== "terminal"
            }
          >
            <TerminalPanel
              host={selectedHost}
              sessions={selectedSessions}
              activeSessionId={activeSessionId}
              visible={!formMode && !forwardFormMode && tab === "terminal"}
              onConnect={() => void connectHost(selectedHost.id)}
              onOpenShell={(launchId) => void openShell(selectedHost.id, launchId)}
              onSelectShell={(id) =>
                setActiveSessionByHost((current) => ({
                  ...current,
                  [selectedHost.id]: id,
                }))
              }
              onCloseShell={(id) => void closeShell(selectedHost.id, id)}
              onSessionCwd={setSessionCwd}
            />
          </div>
        ) : null}
      </main>

      {hostKeyError ? (
        <HostKeyDialog
          error={hostKeyError}
          busy={connectingId !== null}
          onAccept={() => void acceptHostKey()}
          onCancel={() => {
            setHostKeyError(null);
            setPendingTrustHostId(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default App;
