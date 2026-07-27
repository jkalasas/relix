import { useCallback, useEffect, useRef } from "react";
import { EmptyTerminal } from "@/features/shells/components/empty-terminal";
import { ShellTabs } from "@/features/shells/components/shell-tabs";
import { TerminalView } from "@/features/shells/components/terminal-view";
import type { ShellLaunchId } from "@/features/shells/launch";
import type { ShellSession } from "@/features/shells/types";
import type { Host } from "@/features/hosts/types";
import { decodeSshData, listenSshData } from "@/features/ssh";

type TerminalPanelProps = {
  host: Host;
  sessions: ShellSession[];
  activeSessionId: string | null;
  visible: boolean;
  onConnect: () => void;
  onOpenShell: (launchId?: ShellLaunchId) => void;
  onSelectShell: (id: string) => void;
  onCloseShell: (id: string) => void;
  onSessionCwd: (sessionId: string, cwd: string) => void;
};

export function TerminalPanel({
  host,
  sessions,
  activeSessionId,
  visible,
  onConnect,
  onOpenShell,
  onSelectShell,
  onCloseShell,
  onSessionCwd,
}: TerminalPanelProps) {
  const writersRef = useRef<Map<string, (data: string | Uint8Array) => void>>(
    new Map(),
  );

  const setWriter = useCallback(
    (channelId: string, write: (data: string | Uint8Array) => void) => {
      writersRef.current.set(channelId, write);
    },
    [],
  );

  useEffect(() => {
    const activeIds = new Set(
      sessions
        .map((session) => session.channelId)
        .filter((id): id is string => Boolean(id)),
    );
    for (const channelId of writersRef.current.keys()) {
      if (!activeIds.has(channelId)) {
        writersRef.current.delete(channelId);
      }
    }
  }, [sessions]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const fn = await listenSshData((event) => {
        const write = writersRef.current.get(event.sessionId);
        if (!write) return;
        write(decodeSshData(event.data));
      });
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (host.status !== "connected") {
    return (
      <EmptyTerminal
        title={
          host.status === "error"
            ? "Last connection failed"
            : "Terminal is idle"
        }
        description={
          host.status === "error"
            ? (host.lastError ??
              `Could not reach ${host.user}@${host.hostname}. Check the host, port, or credentials, then try again.`)
            : `Connect to ${host.name} to open a shell session.`
        }
        actionLabel={host.status === "error" ? "Retry connect" : "Connect"}
        onAction={onConnect}
      />
    );
  }

  if (sessions.length === 0) {
    const tmux = host.shellMode === "tmux";
    return (
      <EmptyTerminal
        title={tmux ? "No tmux windows" : "No open shells"}
        description={
          tmux
            ? `Connection to ${host.name} is up. Open a window to attach a tmux session.`
            : `Connection to ${host.name} is up. Open a shell to start a PTY session.`
        }
        actionLabel={tmux ? "Open a window" : "Open a shell"}
        onAction={onOpenShell}
      />
    );
  }

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;

  return (
    <div
      role="tabpanel"
      id="panel-terminal"
      aria-labelledby="tab-terminal"
      className="flex min-h-0 flex-1 flex-col"
    >
      <ShellTabs
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={onSelectShell}
        onClose={onCloseShell}
        onNew={(launchId) => onOpenShell(launchId)}
      />
      <div className="relative flex min-h-0 flex-1 flex-col bg-[oklch(0.12_0.012_250)]">
        {sessions.map((session) => {
          if (!session.channelId) return null;
          return (
            <TerminalView
              key={session.channelId}
              sessionId={session.channelId}
              active={session.id === activeSessionId}
              visible={visible}
              onReady={(api) => setWriter(session.channelId!, api.write)}
              onCwdChange={(cwd) => onSessionCwd(session.id, cwd)}
            />
          );
        })}
        {activeSession && !activeSession.channelId ? (
          <div className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
            Attaching {activeSession.title}…
          </div>
        ) : null}
      </div>
    </div>
  );
}
