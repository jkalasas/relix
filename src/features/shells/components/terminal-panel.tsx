import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyTerminal } from "@/features/shells/components/empty-terminal";
import { TerminalKeyBar } from "@/features/shells/components/terminal-key-bar";
import {
  TerminalView,
  type TerminalSessionApi,
} from "@/features/shells/components/terminal-view";
import {
  sessionDisplayTitle,
  type ShellLaunchId,
} from "@/features/shells/lib/launch";
import { useIsMobileOs } from "@/features/shells/lib/mobile-os";
import {
  EMPTY_STICKY_MODS,
  hasStickyMods,
  type StickyMods,
} from "@/features/shells/lib/terminal-keys";
import type { ShellSession } from "@/features/shells/types";
import { isLocalHost, type Host } from "@/features/hosts";
import { decodeSshData, listenSshData } from "@/features/ssh";

type TerminalPanelProps = {
  host: Host;
  sessions: ShellSession[];
  activeSessionId: string | null;
  visible: boolean;
  onConnect: () => void;
  onOpenShell: (launchId?: ShellLaunchId) => void;
  onSessionCwd: (sessionId: string, cwd: string) => void;
};

const MAX_PENDING_CHUNKS = 200;

function pushPending(
  pending: Map<string, Uint8Array[]>,
  channelId: string,
  chunk: Uint8Array,
) {
  const queue = pending.get(channelId) ?? [];
  queue.push(chunk);
  if (queue.length > MAX_PENDING_CHUNKS) {
    queue.splice(0, queue.length - MAX_PENDING_CHUNKS);
  }
  pending.set(channelId, queue);
}

export function TerminalPanel({
  host,
  sessions,
  activeSessionId,
  visible,
  onConnect,
  onOpenShell,
  onSessionCwd,
}: TerminalPanelProps) {
  const isMobileOs = useIsMobileOs();
  const writersRef = useRef<Map<string, TerminalSessionApi>>(new Map());
  const pendingDataRef = useRef<Map<string, Uint8Array[]>>(new Map());
  const [stickyMods, setStickyMods] = useState<StickyMods>(EMPTY_STICKY_MODS);

  const attachApi = useCallback(
    (channelId: string, api: TerminalSessionApi) => {
      writersRef.current.set(channelId, api);
      const pending = pendingDataRef.current.get(channelId);
      if (!pending?.length) return;
      for (const chunk of pending) {
        api.write(chunk);
      }
      pendingDataRef.current.delete(channelId);
    },
    [],
  );

  const detachApi = useCallback(
    (channelId: string, api: TerminalSessionApi) => {
      if (writersRef.current.get(channelId) === api) {
        writersRef.current.delete(channelId);
      }
    },
    [],
  );

  const clearStickyMods = useCallback(() => {
    setStickyMods(EMPTY_STICKY_MODS);
  }, []);

  const toggleStickyMod = useCallback((key: keyof StickyMods) => {
    setStickyMods((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const sendToActive = useCallback(
    (data: string) => {
      const active = sessions.find((session) => session.id === activeSessionId);
      const channelId = active?.channelId;
      if (!channelId) return;
      const api = writersRef.current.get(channelId);
      if (!api) return;
      api.send(data);
      if (hasStickyMods(stickyMods)) {
        clearStickyMods();
      }
      api.focus({ force: true });
    },
    [activeSessionId, clearStickyMods, sessions, stickyMods],
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
    for (const channelId of pendingDataRef.current.keys()) {
      if (!activeIds.has(channelId)) {
        pendingDataRef.current.delete(channelId);
      }
    }
  }, [sessions]);

  useEffect(() => {
    clearStickyMods();
  }, [activeSessionId, clearStickyMods]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const fn = await listenSshData((event) => {
        const bytes = decodeSshData(event.data);
        const api = writersRef.current.get(event.sessionId);
        if (api) {
          api.write(bytes);
          return;
        }
        pushPending(pendingDataRef.current, event.sessionId, bytes);
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

  const local = isLocalHost(host);

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
            ? local
              ? "Open a window to attach the local tmux session."
              : `Connection to ${host.name} is up. Open a window to attach a tmux session.`
            : local
              ? "Open a shell to start a local PTY session."
              : `Connection to ${host.name} is up. Open a shell to start a PTY session.`
        }
        actionLabel={tmux ? "Open a window" : "Open a shell"}
        onAction={onOpenShell}
      />
    );
  }

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;
  const showKeyBar = isMobileOs && visible && activeSession?.channelId != null;

  return (
    <div
      role="tabpanel"
      id={activeSession ? `session-panel-${activeSession.id}` : "session-panel-shell"}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="relative flex min-h-0 flex-1 flex-col bg-[oklch(0.12_0.012_250)]">
        {sessions.map((session) => {
          if (!session.channelId) return null;
          return (
            <TerminalView
              key={session.channelId}
              sessionId={session.channelId}
              active={session.id === activeSessionId}
              visible={visible}
              stickyMods={
                session.id === activeSessionId ? stickyMods : EMPTY_STICKY_MODS
              }
              onStickyConsumed={clearStickyMods}
              onReady={(api) => {
                const channelId = session.channelId!;
                attachApi(channelId, api);
                return () => detachApi(channelId, api);
              }}
              onCwdChange={(cwd) => onSessionCwd(session.id, cwd)}
            />
          );
        })}
        {activeSession && !activeSession.channelId ? (
          <div className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
            Attaching {sessionDisplayTitle(activeSession)}…
          </div>
        ) : null}
      </div>
      {showKeyBar ? (
        <TerminalKeyBar
          mods={stickyMods}
          onToggleMod={toggleStickyMod}
          onSend={sendToActive}
        />
      ) : null}
    </div>
  );
}
