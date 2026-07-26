import { useCallback, useEffect, useMemo, useState } from "react";
import { HostRail } from "@/components/shell/host-rail";
import { SessionHeader } from "@/components/shell/session-header";
import { WorkspaceTabs } from "@/components/shell/workspace-tabs";
import { TerminalPanel } from "@/components/shell/terminal-panel";
import { SftpPanel } from "@/components/shell/sftp-panel";
import { ForwardsPanel } from "@/components/shell/forwards-panel";
import { EmptyWorkspace } from "@/components/shell/empty-workspace";
import { HostForm } from "@/components/shell/host-form";
import { HostKeyDialog } from "@/components/shell/host-key-dialog";
import {
  configsToHosts,
  loadHostConfigs,
  saveHostConfigs,
  toHostConfig,
} from "@/lib/hosts-store";
import {
  listenSshConnectionClosed,
  listenSshShellClosed,
  parseSshError,
  sshCloseShell,
  sshConnect,
  sshDisconnect,
  sshOpenShell,
  sshTrustHostKey,
} from "@/lib/ssh";
import type {
  Host,
  HostConfig,
  PortForward,
  ShellSession,
  SshCommandError,
  WorkspaceTab,
} from "@/lib/types";

type MobilePane = "hosts" | "session";
type FormMode = { type: "add" } | { type: "edit"; id: string } | null;

function nextShellTitle(existing: ShellSession[]): string {
  if (existing.length === 0) return "shell";
  return `shell ${existing.length + 1}`;
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
      const configs = await loadHostConfigs();
      if (cancelled) return;
      setHosts(configsToHosts(configs));
      const forwards: Record<string, PortForward[]> = {};
      for (const config of configs) forwards[config.id] = [];
      setForwardsByHost(forwards);
      setSelectedId(configs[0]?.id ?? null);
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
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
      });
      if (disposed) {
        connectionClosed();
        return;
      }
      unsubs.push(connectionClosed);
    })();

    return () => {
      disposed = true;
      for (const fn of unsubs) fn();
    };
  }, []);

  // After shell list updates, if active is null but sessions remain, select first
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

  const connectHost = useCallback(
    async (id: string) => {
      const host = hosts.find((item) => item.id === id);
      if (!host) return;
      setConnectingId(id);
      setHostKeyError(null);
      try {
        await sshConnect(host);
        setHostStatus(id, "connected");
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
    [hosts, setHostStatus],
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
      setHostStatus(id, "idle");
    },
    [sessionsByHost, setHostStatus],
  );

  const openShell = useCallback(async (hostId: string) => {
    try {
      const { sessionId } = await sshOpenShell(hostId);
      setSessionsByHost((current) => {
        const existing = current[hostId] ?? [];
        const next: ShellSession = {
          id: sessionId,
          hostId,
          title: nextShellTitle(existing),
        };
        return { ...current, [hostId]: [...existing, next] };
      });
      setActiveSessionByHost((current) => ({ ...current, [hostId]: sessionId }));
    } catch {
      setHostStatus(hostId, "error");
    }
  }, [setHostStatus]);

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
    setMobilePane("session");
  }, []);

  const backToHosts = useCallback(() => {
    setMobilePane("hosts");
    setFormMode(null);
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
      setForwardsByHost((current) =>
        current[config.id] ? current : { ...current, [config.id]: [] },
      );
      setSelectedId(config.id);
      setFormMode(null);
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
        return next;
      });
      setSessionsByHost((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setSelectedId((current) => (current === id ? null : current));
      setFormMode(null);
      setMobilePane("hosts");
    },
    [disconnectHost, persistHosts],
  );

  const addForward = useCallback(() => {
    if (!selectedHost || selectedHost.status !== "connected") return;
    const id = `fwd-${selectedHost.id}-${Date.now()}`;
    const next: PortForward = {
      id,
      type: "L",
      local: "localhost:8080",
      remote: "127.0.0.1:8080",
      status: "idle",
    };
    setForwardsByHost((current) => ({
      ...current,
      [selectedHost.id]: [...(current[selectedHost.id] ?? []), next],
    }));
  }, [selectedHost]);

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
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hosts, selectedId, mobilePane]);

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

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <HostRail
        hosts={hosts}
        selectedId={selectedId}
        onSelect={selectHost}
        onAddHost={() => {
          setFormMode({ type: "add" });
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
        ) : selectedHost ? (
          <>
            <SessionHeader
              host={selectedHost}
              connecting={connectingId === selectedHost.id}
              onConnect={() => void connectHost(selectedHost.id)}
              onDisconnect={() => void disconnectHost(selectedHost.id)}
              onEdit={() => setFormMode({ type: "edit", id: selectedHost.id })}
              onBack={backToHosts}
            />
            <WorkspaceTabs active={tab} onChange={setTab} />
            {tab === "terminal" ? (
              <TerminalPanel
                host={selectedHost}
                sessions={selectedSessions}
                activeSessionId={activeSessionId}
                onConnect={() => void connectHost(selectedHost.id)}
                onOpenShell={() => void openShell(selectedHost.id)}
                onSelectShell={(id) =>
                  setActiveSessionByHost((current) => ({
                    ...current,
                    [selectedHost.id]: id,
                  }))
                }
                onCloseShell={(id) => void closeShell(selectedHost.id, id)}
              />
            ) : null}
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
                onAddForward={addForward}
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
