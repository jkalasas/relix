import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyTerminal } from "@/features/shells/components/empty-terminal";
import { TerminalKeyBar } from "@/features/shells/components/terminal-key-bar";
import {
  TerminalView,
  type TerminalSessionApi,
} from "@/features/shells/components/terminal-view";
import {
  sessionDisplayTitle,
  type ShellLaunchId,
} from "@/features/shells/launch";
import { useIsMobileOs } from "@/features/shells/lib/mobile-os";
import {
  EMPTY_STICKY_MODS,
  hasStickyMods,
  type StickyMods,
} from "@/features/shells/lib/terminal-keys";
import type { ShellSession } from "@/features/shells/types";
import { isLocalHost, type Host } from "@/features/hosts";
import { decodeSshData, listenSshData } from "@/features/ssh";

export type LiveTerminal = {
  workspaceId: string;
  host: Host;
  session: ShellSession;
};

type TerminalHostProps = {
  terminals: LiveTerminal[];
  /** Workspace currently shown in the UI (null when not on a workspace page). */
  activeWorkspaceId: string | null;
  /** Active shell session id for the active workspace. */
  activeSessionId: string | null;
  /** Shell chrome is the visible surface (not files/ports/other page). */
  surfaceOpen: boolean;
  onConnect: (hostId: string) => void;
  onOpenShell: (workspaceId: string, hostId: string, launchId?: ShellLaunchId) => void;
  onSessionCwd: (sessionId: string, cwd: string) => void;
  /** Host for empty-state when active workspace has no live channels yet. */
  emptyHost?: Host | null;
  emptyWorkspaceId?: string | null;
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

/**
 * Owns every live PTY surface for the app lifetime of each channel.
 * Keyed only by channelId — workspace switches never remount xterm.
 */
export function TerminalHost({
  terminals,
  activeWorkspaceId,
  activeSessionId,
  surfaceOpen,
  onConnect,
  onOpenShell,
  onSessionCwd,
  emptyHost = null,
  emptyWorkspaceId = null,
}: TerminalHostProps) {
  const isMobileOs = useIsMobileOs();
  const writersRef = useRef<Map<string, TerminalSessionApi>>(new Map());
  const pendingDataRef = useRef<Map<string, Uint8Array[]>>(new Map());
  const [stickyMods, setStickyMods] = useState<StickyMods>(EMPTY_STICKY_MODS);

  const channelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of terminals) {
      if (item.session.channelId) ids.add(item.session.channelId);
    }
    return ids;
  }, [terminals]);

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

  const activeLive = useMemo(() => {
    if (!activeWorkspaceId || !activeSessionId) return null;
    return (
      terminals.find(
        (item) =>
          item.workspaceId === activeWorkspaceId &&
          item.session.id === activeSessionId,
      ) ?? null
    );
  }, [activeSessionId, activeWorkspaceId, terminals]);

  const sendToActive = useCallback(
    (data: string) => {
      const channelId = activeLive?.session.channelId;
      if (!channelId) return;
      const api = writersRef.current.get(channelId);
      if (!api) return;
      api.send(data);
      if (hasStickyMods(stickyMods)) {
        clearStickyMods();
      }
      api.focus({ force: true });
    },
    [activeLive, clearStickyMods, stickyMods],
  );

  useEffect(() => {
    for (const channelId of writersRef.current.keys()) {
      if (!channelIds.has(channelId)) {
        writersRef.current.delete(channelId);
      }
    }
    for (const channelId of pendingDataRef.current.keys()) {
      if (!channelIds.has(channelId)) {
        pendingDataRef.current.delete(channelId);
      }
    }
  }, [channelIds]);

  useEffect(() => {
    clearStickyMods();
  }, [activeSessionId, clearStickyMods]);

  // One listener for the whole app — survives workspace switches.
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

  const workspaceTerminals = useMemo(() => {
    if (!activeWorkspaceId) return [];
    return terminals.filter((item) => item.workspaceId === activeWorkspaceId);
  }, [activeWorkspaceId, terminals]);

  const showEmpty =
    surfaceOpen &&
    activeWorkspaceId != null &&
    emptyHost != null &&
    workspaceTerminals.length === 0;

  const showKeyBar =
    isMobileOs &&
    surfaceOpen &&
    activeLive?.session.channelId != null;

  return (
    <div
      className={
        surfaceOpen
          ? "relative flex min-h-0 flex-1 flex-col"
          : "pointer-events-none fixed top-0 left-[-100vw] z-[-1] h-[70vh] w-[70vw] opacity-0"
      }
      aria-hidden={!surfaceOpen}
    >
      <div className="relative flex min-h-0 flex-1 flex-col bg-[oklch(0.12_0.012_250)]">
        {terminals.map(({ workspaceId, session }) => {
          const channelId = session.channelId;
          if (!channelId) return null;

          const onActiveWorkspace = workspaceId === activeWorkspaceId;
          const isActiveSession = session.id === activeSessionId;
          // Mount once per channelId for the life of the PTY.
          // visible stays true whenever shell chrome is open so workspace
          // switches only flip `active` (layout), never tear down xterm.
          const active =
            surfaceOpen && onActiveWorkspace && isActiveSession;

          return (
            <TerminalView
              key={channelId}
              sessionId={channelId}
              active={active}
              visible={surfaceOpen}
              stickyMods={active ? stickyMods : EMPTY_STICKY_MODS}
              onStickyConsumed={clearStickyMods}
              onReady={(api) => {
                attachApi(channelId, api);
                return () => detachApi(channelId, api);
              }}
              onCwdChange={(cwd) => onSessionCwd(session.id, cwd)}
            />
          );
        })}

        {showEmpty && emptyHost ? (
          emptyHost.status !== "connected" && !isLocalHost(emptyHost) ? (
            <EmptyTerminal
              title={
                emptyHost.status === "error"
                  ? "Last connection failed"
                  : "Terminal is idle"
              }
              description={
                emptyHost.status === "error"
                  ? (emptyHost.lastError ??
                    `Could not reach ${emptyHost.user}@${emptyHost.hostname}. Check the host, port, or credentials, then try again.`)
                  : `Connect to ${emptyHost.name} to open a shell session.`
              }
              actionLabel={
                emptyHost.status === "error" ? "Retry connect" : "Connect"
              }
              onAction={() => onConnect(emptyHost.id)}
            />
          ) : (
            <EmptyTerminal
              title={
                !isLocalHost(emptyHost) && emptyHost.shellMode === "tmux"
                  ? "No tmux windows"
                  : "No open shells"
              }
              description={
                !isLocalHost(emptyHost) && emptyHost.shellMode === "tmux"
                  ? `Connection to ${emptyHost.name} is up. Open a window to attach a tmux session.`
                  : isLocalHost(emptyHost)
                    ? "Open a shell to start a local PTY session."
                    : `Connection to ${emptyHost.name} is up. Open a shell to start a PTY session.`
              }
              actionLabel={
                !isLocalHost(emptyHost) && emptyHost.shellMode === "tmux"
                  ? "Open a window"
                  : "Open a shell"
              }
              onAction={() => {
                if (!emptyWorkspaceId) return;
                onOpenShell(emptyWorkspaceId, emptyHost.id);
              }}
            />
          )
        ) : null}

        {surfaceOpen &&
        activeLive &&
        !activeLive.session.channelId ? (
          <div className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
            Attaching {sessionDisplayTitle(activeLive.session)}…
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
