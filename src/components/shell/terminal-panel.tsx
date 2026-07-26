import { useCallback, useEffect, useRef } from "react";
import { TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShellTabs } from "@/components/shell/shell-tabs";
import { TerminalView } from "@/components/shell/terminal-view";
import { decodeSshData, listenSshData } from "@/lib/ssh";
import type { Host, ShellSession } from "@/lib/types";

type TerminalPanelProps = {
  host: Host;
  sessions: ShellSession[];
  activeSessionId: string | null;
  onConnect: () => void;
  onOpenShell: () => void;
  onSelectShell: (id: string) => void;
  onCloseShell: (id: string) => void;
};

export function TerminalPanel({
  host,
  sessions,
  activeSessionId,
  onConnect,
  onOpenShell,
  onSelectShell,
  onCloseShell,
}: TerminalPanelProps) {
  const writersRef = useRef<Map<string, (data: string | Uint8Array) => void>>(
    new Map(),
  );

  const setWriter = useCallback(
    (sessionId: string, write: (data: string | Uint8Array) => void) => {
      writersRef.current.set(sessionId, write);
    },
    [],
  );

  useEffect(() => {
    const activeIds = new Set(sessions.map((session) => session.id));
    for (const sessionId of writersRef.current.keys()) {
      if (!activeIds.has(sessionId)) {
        writersRef.current.delete(sessionId);
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
            ? `Could not reach ${host.user}@${host.hostname}. Check the host, port, or credentials, then try again.`
            : `Connect to ${host.name} to open a shell session.`
        }
        actionLabel={host.status === "error" ? "Retry connect" : "Connect"}
        onAction={onConnect}
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyTerminal
        title="No open shells"
        description={`Connection to ${host.name} is up. Open a shell to start a PTY session.`}
        actionLabel="Open a shell"
        onAction={onOpenShell}
      />
    );
  }

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
        onNew={onOpenShell}
      />
      <div className="relative flex min-h-0 flex-1 flex-col bg-[oklch(0.12_0.012_250)]">
        {sessions.map((session) => (
          <TerminalView
            key={session.id}
            sessionId={session.id}
            active={session.id === activeSessionId}
            onReady={(api) => setWriter(session.id, api.write)}
          />
        ))}
      </div>
    </div>
  );
}

type EmptyTerminalProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

function EmptyTerminal({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyTerminalProps) {
  return (
    <div
      role="tabpanel"
      id="panel-terminal"
      aria-labelledby="tab-terminal"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
        <TerminalSquare className="size-5" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-sm font-medium text-balance">{title}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      <Button type="button" size="sm" onClick={onAction} className="min-h-9 px-3 md:min-h-7">
        {actionLabel}
      </Button>
    </div>
  );
}
