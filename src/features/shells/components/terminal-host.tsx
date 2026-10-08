import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import type { Event as TauriEvent } from "@tauri-apps/api/event";
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
import {
  basenameOf,
  ClipboardUploadDialog,
  type ClipboardController,
  type ClipboardSource,
} from "@/features/clipboard";
import { isLocalHost, type Host } from "@/features/hosts";
import { decodeSshData, listenSshData, readClipboardFilePaths } from "@/features/ssh";

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
  /** Shell sessions for the active workspace (including not-yet-attached). */
  workspaceSessions?: ShellSession[];
  /** Shell chrome is the visible surface (not files/ports/other page). */
  surfaceOpen: boolean;
  onConnect: (hostId: string) => void;
  onOpenShell: (workspaceId: string, hostId: string, launchId?: ShellLaunchId) => void;
  onSessionCwd: (sessionId: string, cwd: string) => void;
  /** Host for empty-state when active workspace has no live channels yet. */
  emptyHost?: Host | null;
  emptyWorkspaceId?: string | null;
  clipboard: ClipboardController;
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
  workspaceSessions = [],
  surfaceOpen,
  onConnect,
  onOpenShell,
  onSessionCwd,
  emptyHost = null,
  emptyWorkspaceId = null,
  clipboard,
}: TerminalHostProps) {
  const {
    setTarget: setClipboardTarget,
    stageSources: stageClipboardSources,
    stageBlobs: stageClipboardBlobs,
    upload: clipboardUpload,
    cancel: cancelClipboardUpload,
    dismiss: dismissClipboardUpload,
    pickAndStage: pickClipboardFiles,
  } = clipboard;
  const isMobileOs = useIsMobileOs();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
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

  useEffect(() => {
    const channelId = activeLive?.session.channelId;
    if (!surfaceOpen || !activeLive || !channelId) {
      setClipboardTarget(null);
      return;
    }
    const hostId = activeLive.host.id;
    const local = isLocalHost(activeLive.host);
    setClipboardTarget({
      hostId,
      local,
      send: (text) => {
        writersRef.current.get(channelId)?.send(text);
      },
    });
    return () => setClipboardTarget(null);
  }, [activeLive, surfaceOpen, setClipboardTarget]);

  const isOverTerminal = useCallback((position: { x: number; y: number }) => {
    const element = containerRef.current;
    if (!element) return true;
    const rect = element.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const x = position.x / scale;
    const y = position.y / scale;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, []);

  const dragHandlerRef = useRef<(event: TauriEvent<DragDropEvent>) => void>(() => {});
  dragHandlerRef.current = (event) => {
    if (event.payload.type === "leave") {
      setDragOver(false);
      return;
    }
    if (!isOverTerminal(event.payload.position)) {
      setDragOver(false);
      return;
    }
    if (event.payload.type === "drop") {
      setDragOver(false);
      if (event.payload.paths.length === 0) return;
      const sources: ClipboardSource[] = event.payload.paths.map((path) => ({
        kind: "path",
        path,
        name: basenameOf(path),
      }));
      void stageClipboardSources(sources);
      return;
    }
    setDragOver(true);
  };

  useEffect(() => {
    if (!surfaceOpen) {
      setDragOver(false);
      return;
    }
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const stop = await getCurrentWebview().onDragDropEvent((event) => {
          dragHandlerRef.current(event);
        });
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
      } catch {
        // drag-drop events unavailable (mobile)
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
      setDragOver(false);
    };
  }, [surfaceOpen]);

  // Capture phase: xterm's own paste listener calls stopPropagation(),
  // so a bubble-phase onPaste here would never fire for terminal
  // pastes. Intercept files/images first, then leave text to xterm.
  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const data = event.clipboardData;
      if (!data) return;
      const hasFiles = data.files && data.files.length > 0;
      const imageItem = hasFiles
        ? undefined
        : Array.from(data.items ?? []).find((item) =>
            item.type.startsWith("image/"),
          );
      if (!hasFiles && !imageItem) return;
      // Screenshots and Copy-Image arrive as image items with an empty
      // files list. Stage them here so xterm never sees the raw bytes.
      event.preventDefault();
      event.stopPropagation();
      if (hasFiles) {
        void stageClipboardBlobs(Array.from(data.files));
        return;
      }
      const file = imageItem?.getAsFile();
      if (!file) return;
      const ext = imageItem?.type.split("/")[1] ?? "bin";
      const named = file.name
        ? file
        : new File([file], `paste.${ext}`, { type: imageItem?.type });
      void stageClipboardBlobs([named]);
    },
    [stageClipboardBlobs],
  );

  const readClipboardImages = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.read) return false;
      const permission = await navigator.permissions
        ?.query({ name: "clipboard-read" as PermissionName })
        .catch(() => null);
      if (permission?.state === "denied") return false;
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        files.push(new File([blob], `paste.${imageType.split("/")[1] ?? "bin"}`));
      }
      if (files.length === 0) return false;
      await stageClipboardBlobs(files);
      return true;
    } catch {
      // clipboard unreadable — paste event or Attach covers the rest
      return false;
    }
  }, [stageClipboardBlobs]);

  const stageOsClipboardFiles = useCallback(async (): Promise<boolean> => {
    try {
      const paths = await readClipboardFilePaths();
      if (paths.length === 0) return false;
      const sources: ClipboardSource[] = paths.map((path) => ({
        kind: "path",
        path,
        name: basenameOf(path),
      }));
      await stageClipboardSources(sources);
      return true;
    } catch {
      return false;
    }
  }, [stageClipboardSources]);

  const readClipboardFallback = useCallback(async () => {
    if (await readClipboardImages()) return;
    await stageOsClipboardFiles();
  }, [readClipboardImages, stageOsClipboardFiles]);

  useEffect(() => {
    if (!surfaceOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const pasteChord =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key === "v" || event.key === "V");
      if (!pasteChord) return;
      if (!containerRef.current?.contains(document.activeElement)) return;
      void readClipboardFallback();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [surfaceOpen, readClipboardFallback]);

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

  const pendingSession = useMemo(() => {
    if (!surfaceOpen || workspaceSessions.length === 0) return null;
    const active =
      (activeSessionId
        ? workspaceSessions.find((session) => session.id === activeSessionId)
        : null) ?? workspaceSessions[0];
    if (!active || active.channelId) return null;
    return active;
  }, [activeSessionId, surfaceOpen, workspaceSessions]);

  const showEmpty =
    surfaceOpen &&
    activeWorkspaceId != null &&
    emptyHost != null &&
    workspaceSessions.length === 0 &&
    workspaceTerminals.length === 0;

  const showKeyBar =
    isMobileOs &&
    surfaceOpen &&
    activeLive?.session.channelId != null;

  return (
    <div
      onPasteCapture={handlePasteCapture}
      className={
        surfaceOpen
          ? "relative flex min-h-0 flex-1 flex-col"
          : "pointer-events-none invisible fixed top-0 left-[-100vw] z-[-1] h-[70vh] w-[70vw] opacity-0 [content-visibility:hidden]"
      }
      aria-hidden={!surfaceOpen}
    >
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 flex-col bg-[oklch(0.12_0.012_250)]"
      >
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
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            {emptyHost.status !== "connected" && !isLocalHost(emptyHost) ? (
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
                  emptyHost.shellMode === "tmux"
                    ? "No tmux windows"
                    : "No open shells"
                }
                description={
                  emptyHost.shellMode === "tmux"
                    ? isLocalHost(emptyHost)
                      ? "Open a window to attach the local tmux session."
                      : `Connection to ${emptyHost.name} is up. Open a window to attach a tmux session.`
                    : isLocalHost(emptyHost)
                      ? "Open a shell to start a local PTY session."
                      : `Connection to ${emptyHost.name} is up. Open a shell to start a PTY session.`
                }
                actionLabel={
                  emptyHost.shellMode === "tmux"
                    ? "Open a window"
                    : "Open a shell"
                }
                onAction={() => {
                  if (!emptyWorkspaceId) return;
                  onOpenShell(emptyWorkspaceId, emptyHost.id);
                }}
              />
            )}
          </div>
        ) : null}

        {surfaceOpen && pendingSession ? (
          <div className="relative z-10 flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
            Attaching {sessionDisplayTitle(pendingSession)}…
          </div>
        ) : null}

        {dragOver ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary bg-background/70">
            <p className="text-sm text-muted-foreground">
              Drop files to paste paths
            </p>
          </div>
        ) : null}
      </div>

      {showKeyBar ? (
        <TerminalKeyBar
          mods={stickyMods}
          onToggleMod={toggleStickyMod}
          onSend={sendToActive}
          onAttach={() => void pickClipboardFiles()}
        />
      ) : null}

      <ClipboardUploadDialog
        upload={clipboardUpload}
        onCancel={cancelClipboardUpload}
        onDismiss={dismissClipboardUpload}
      />
    </div>
  );
}
