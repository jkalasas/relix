import { useCallback, useEffect, useMemo, useState } from "react";
import { HostRail } from "@/components/shell/host-rail";
import { SessionHeader } from "@/components/shell/session-header";
import { WorkspaceTabs } from "@/components/shell/workspace-tabs";
import { TerminalPanel } from "@/components/shell/terminal-panel";
import { SftpPanel } from "@/components/shell/sftp-panel";
import { ForwardsPanel } from "@/components/shell/forwards-panel";
import { EmptyWorkspace } from "@/components/shell/empty-workspace";
import { seedForwards, seedHosts } from "@/lib/seed";
import type { Host, PortForward, WorkspaceTab } from "@/lib/types";

type MobilePane = "hosts" | "session";

function App() {
  const [hosts, setHosts] = useState<Host[]>(seedHosts);
  const [forwardsByHost, setForwardsByHost] =
    useState<Record<string, PortForward[]>>(seedForwards);
  const [selectedId, setSelectedId] = useState<string | null>(
    seedHosts[0]?.id ?? null,
  );
  const [tab, setTab] = useState<WorkspaceTab>("terminal");
  const [mobilePane, setMobilePane] = useState<MobilePane>("hosts");

  const selectedHost = useMemo(
    () => hosts.find((host) => host.id === selectedId) ?? null,
    [hosts, selectedId],
  );

  const selectedForwards = selectedHost
    ? (forwardsByHost[selectedHost.id] ?? [])
    : [];

  const setHostStatus = useCallback((id: string, status: Host["status"]) => {
    setHosts((current) =>
      current.map((host) => (host.id === id ? { ...host, status } : host)),
    );
  }, []);

  const connectHost = useCallback(
    (id: string) => {
      setHostStatus(id, "connected");
    },
    [setHostStatus],
  );

  const disconnectHost = useCallback(
    (id: string) => {
      setHostStatus(id, "idle");
    },
    [setHostStatus],
  );

  const selectHost = useCallback((id: string) => {
    setSelectedId(id);
    setMobilePane("session");
  }, []);

  const backToHosts = useCallback(() => {
    setMobilePane("hosts");
  }, []);

  const addHost = useCallback(() => {
    const index = hosts.length + 1;
    const id = `host-${index}`;
    const next: Host = {
      id,
      name: `host-${index}`,
      user: "user",
      hostname: `host-${index}.local`,
      port: 22,
      status: "idle",
    };
    setHosts((current) => [...current, next]);
    setForwardsByHost((current) => ({ ...current, [id]: [] }));
    setSelectedId(id);
    setTab("terminal");
    setMobilePane("session");
  }, [hosts.length]);

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
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hosts, selectedId, mobilePane]);

  const showHostRail =
    mobilePane === "hosts" ? "flex" : "hidden md:flex";
  const showSession =
    mobilePane === "session" ? "flex" : "hidden md:flex";

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <HostRail
        hosts={hosts}
        selectedId={selectedId}
        onSelect={selectHost}
        onAddHost={addHost}
        className={showHostRail}
      />

      <main className={`min-w-0 flex-1 flex-col ${showSession}`}>
        {selectedHost ? (
          <>
            <SessionHeader
              host={selectedHost}
              onConnect={() => connectHost(selectedHost.id)}
              onDisconnect={() => disconnectHost(selectedHost.id)}
              onBack={backToHosts}
            />
            <WorkspaceTabs active={tab} onChange={setTab} />
            {tab === "terminal" ? (
              <TerminalPanel
                host={selectedHost}
                onConnect={() => connectHost(selectedHost.id)}
              />
            ) : null}
            {tab === "sftp" ? (
              <SftpPanel
                host={selectedHost}
                onConnect={() => connectHost(selectedHost.id)}
              />
            ) : null}
            {tab === "forwards" ? (
              <ForwardsPanel
                host={selectedHost}
                forwards={selectedForwards}
                onConnect={() => connectHost(selectedHost.id)}
                onAddForward={addForward}
              />
            ) : null}
          </>
        ) : (
          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <EmptyWorkspace onAddHost={addHost} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
