import { useCallback, useEffect, useRef, useState } from "react";
import type { ShellMode } from "@/features/hosts/types";
import {
  nextSessionTitle,
  shellLaunchById,
  type ShellLaunchId,
} from "@/features/shells/launch";
import type { ShellSession } from "@/features/shells/types";
import {
  sshCloseShell,
  sshOpenShell,
  sshTmuxBootstrap,
  sshTmuxKillSession,
  sshTmuxKillWindow,
  sshTmuxListWindows,
  sshTmuxNewWindow,
  tmuxAttachCommand,
  type TmuxWindow,
} from "@/features/ssh";

export const DEFAULT_TMUX_SESSION = "relix";

export type ShellHostOptions = {
  shellMode?: ShellMode;
  tmuxSession?: string;
};

type UseShellsOptions = {
  onOpenFailed?: (hostId: string) => void;
};

function resolveTmuxSession(session?: string): string {
  const trimmed = session?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_TMUX_SESSION;
}

async function closeChannel(channelId?: string) {
  if (!channelId) return;
  try {
    await sshCloseShell(channelId);
  } catch {
    // still drop locally
  }
}

function mergeTmuxSessions(
  hostId: string,
  tmuxSession: string,
  existing: ShellSession[],
  windows: TmuxWindow[],
): { sessions: ShellSession[]; deadChannels: string[] } {
  const previous = new Map(
    existing
      .filter((session) => session.tmuxWindowId)
      .map((session) => [session.tmuxWindowId!, session]),
  );
  const sessions: ShellSession[] = windows.map((window) => {
    const prior = previous.get(window.id);
    if (prior) {
      previous.delete(window.id);
      return {
        ...prior,
        title: window.name || prior.title,
        tmuxSession,
      };
    }
    return {
      id: crypto.randomUUID(),
      hostId,
      title: window.name,
      tmuxWindowId: window.id,
      tmuxSession,
    };
  });
  const deadChannels = [...previous.values()]
    .map((session) => session.channelId)
    .filter((id): id is string => Boolean(id));
  return { sessions, deadChannels };
}

export function useShells(options: UseShellsOptions = {}) {
  const { onOpenFailed } = options;

  const [sessionsByHost, setSessionsByHost] = useState<
    Record<string, ShellSession[]>
  >({});
  const [activeSessionByHost, setActiveSessionByHost] = useState<
    Record<string, string | null>
  >({});
  const sessionsByHostRef = useRef(sessionsByHost);
  sessionsByHostRef.current = sessionsByHost;

  const attachTmuxWindow = useCallback(
    async (
      hostId: string,
      sessionId: string,
      tmuxSession: string,
      tmuxWindowId: string,
    ) => {
      const { sessionId: channelId } = await sshOpenShell(hostId, {
        command: tmuxAttachCommand(tmuxSession, tmuxWindowId),
      });
      setSessionsByHost((current) => {
        const list = current[hostId] ?? [];
        return {
          ...current,
          [hostId]: list.map((session) =>
            session.id === sessionId ? { ...session, channelId } : session,
          ),
        };
      });
      return channelId;
    },
    [],
  );

  const reconcileTmux = useCallback(async (hostId: string, tmuxSession: string) => {
    try {
      const result = await sshTmuxListWindows(hostId, tmuxSession);
      const existing = sessionsByHostRef.current[hostId] ?? [];
      const { sessions, deadChannels } = mergeTmuxSessions(
        hostId,
        result.session,
        existing,
        result.windows,
      );
      for (const channelId of deadChannels) {
        void closeChannel(channelId);
      }
      sessionsByHostRef.current = {
        ...sessionsByHostRef.current,
        [hostId]: sessions,
      };
      setSessionsByHost((current) => ({ ...current, [hostId]: sessions }));
      setActiveSessionByHost((current) => {
        const activeId = current[hostId];
        if (!activeId) return current;
        if (sessions.some((session) => session.id === activeId)) return current;
        return { ...current, [hostId]: sessions[0]?.id ?? null };
      });
      return sessions;
    } catch {
      return sessionsByHostRef.current[hostId] ?? [];
    }
  }, []);

  const bootstrapTmux = useCallback(
    async (hostId: string, tmuxSession?: string) => {
      try {
        const result = await sshTmuxBootstrap(
          hostId,
          resolveTmuxSession(tmuxSession),
        );
        const sessions: ShellSession[] = result.windows.map((window) => ({
          id: crypto.randomUUID(),
          hostId,
          title: window.name,
          tmuxWindowId: window.id,
          tmuxSession: result.session,
        }));
        const activeWindow =
          result.windows.find((window) => window.active) ?? result.windows[0];
        const activeSession =
          sessions.find(
            (session) => session.tmuxWindowId === activeWindow?.id,
          ) ?? sessions[0];

        setSessionsByHost((current) => ({ ...current, [hostId]: sessions }));
        setActiveSessionByHost((current) => ({
          ...current,
          [hostId]: activeSession?.id ?? null,
        }));

        if (activeSession?.tmuxWindowId) {
          await attachTmuxWindow(
            hostId,
            activeSession.id,
            result.session,
            activeSession.tmuxWindowId,
          );
        }
      } catch (error) {
        onOpenFailed?.(hostId);
        throw error;
      }
    },
    [attachTmuxWindow, onOpenFailed],
  );

  const openShell = useCallback(
    async (
      hostId: string,
      launchId: ShellLaunchId = "shell",
      hostOptions: ShellHostOptions = {},
    ) => {
      const launch = shellLaunchById(launchId);
      const shellMode = hostOptions.shellMode === "tmux" ? "tmux" : "plain";
      const tmuxSession = resolveTmuxSession(hostOptions.tmuxSession);
      const activeId = activeSessionByHost[hostId] ?? null;
      const activeSession = (sessionsByHost[hostId] ?? []).find(
        (session) => session.id === activeId,
      );
      const cwd = activeSession?.cwd;

      try {
        if (shellMode === "tmux") {
          const window = await sshTmuxNewWindow(hostId, {
            session: tmuxSession,
            name: launch.title,
            command: launch.command,
            cwd,
            sourceWindowId: activeSession?.tmuxWindowId,
          });
          const sessionId = crypto.randomUUID();
          const next: ShellSession = {
            id: sessionId,
            hostId,
            title:
              window.name ||
              nextSessionTitle(sessionsByHost[hostId] ?? [], launch.title),
            cwd,
            tmuxWindowId: window.id,
            tmuxSession,
          };
          setSessionsByHost((current) => {
            const existing = current[hostId] ?? [];
            return { ...current, [hostId]: [...existing, next] };
          });
          setActiveSessionByHost((current) => ({
            ...current,
            [hostId]: sessionId,
          }));
          await attachTmuxWindow(hostId, sessionId, tmuxSession, window.id);
          return;
        }

        const { sessionId: channelId } = await sshOpenShell(hostId, {
          command: launch.command,
          cwd,
        });
        const sessionId = crypto.randomUUID();
        setSessionsByHost((current) => {
          const existing = current[hostId] ?? [];
          const next: ShellSession = {
            id: sessionId,
            hostId,
            title: nextSessionTitle(existing, launch.title),
            cwd,
            channelId,
          };
          return { ...current, [hostId]: [...existing, next] };
        });
        setActiveSessionByHost((current) => ({
          ...current,
          [hostId]: sessionId,
        }));
      } catch (error) {
        onOpenFailed?.(hostId);
        throw error;
      }
    },
    [activeSessionByHost, attachTmuxWindow, onOpenFailed, sessionsByHost],
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

  const closeShell = useCallback(
    async (hostId: string, sessionId: string) => {
      const session = (sessionsByHostRef.current[hostId] ?? []).find(
        (item) => item.id === sessionId,
      );
      if (session?.tmuxWindowId && session.tmuxSession) {
        try {
          await sshTmuxKillWindow(
            hostId,
            session.tmuxSession,
            session.tmuxWindowId,
          );
        } catch {
          // still drop locally
        }
      }
      await closeChannel(session?.channelId);
      setSessionsByHost((current) => ({
        ...current,
        [hostId]: (current[hostId] ?? []).filter((s) => s.id !== sessionId),
      }));
      setActiveSessionByHost((current) => {
        if (current[hostId] !== sessionId) return current;
        return { ...current, [hostId]: null };
      });
    },
    [],
  );

  const killTmuxSession = useCallback(
    async (hostId: string, tmuxSession?: string) => {
      const sessions = sessionsByHostRef.current[hostId] ?? [];
      const sessionName = resolveTmuxSession(
        tmuxSession ??
          sessions.find((session) => session.tmuxSession)?.tmuxSession,
      );
      try {
        await sshTmuxKillSession(hostId, sessionName);
      } finally {
        for (const session of sessions) {
          await closeChannel(session.channelId);
        }
        setSessionsByHost((current) => ({ ...current, [hostId]: [] }));
        setActiveSessionByHost((current) => ({
          ...current,
          [hostId]: null,
        }));
      }
    },
    [],
  );

  const selectShell = useCallback(
    async (hostId: string, sessionId: string) => {
      const session = (sessionsByHostRef.current[hostId] ?? []).find(
        (item) => item.id === sessionId,
      );
      let sessions = sessionsByHostRef.current[hostId] ?? [];
      if (session?.tmuxSession) {
        sessions = await reconcileTmux(hostId, session.tmuxSession);
      }

      const target =
        sessions.find((item) => item.id === sessionId) ??
        sessions.find(
          (item) => item.tmuxWindowId === session?.tmuxWindowId,
        ) ??
        sessions[0];

      if (!target) {
        setActiveSessionByHost((current) => ({ ...current, [hostId]: null }));
        return;
      }

      setActiveSessionByHost((current) => ({
        ...current,
        [hostId]: target.id,
      }));

      if (target.tmuxWindowId && target.tmuxSession && !target.channelId) {
        try {
          await attachTmuxWindow(
            hostId,
            target.id,
            target.tmuxSession,
            target.tmuxWindowId,
          );
        } catch (error) {
          onOpenFailed?.(hostId);
          throw error;
        }
      }
    },
    [attachTmuxWindow, onOpenFailed, reconcileTmux],
  );

  const clearHostShells = useCallback(async (hostId: string) => {
    const sessions = sessionsByHostRef.current[hostId] ?? [];
    for (const session of sessions) {
      await closeChannel(session.channelId);
    }
    setSessionsByHost((current) => ({ ...current, [hostId]: [] }));
    setActiveSessionByHost((current) => ({ ...current, [hostId]: null }));
  }, []);

  const removeHostShells = useCallback((hostId: string) => {
    setSessionsByHost((current) => {
      const next = { ...current };
      delete next[hostId];
      return next;
    });
    setActiveSessionByHost((current) => {
      const next = { ...current };
      delete next[hostId];
      return next;
    });
  }, []);

  const handleChannelClosed = useCallback(
    (hostId: string, channelId: string) => {
      const list = sessionsByHostRef.current[hostId] ?? [];
      const session = list.find((item) => item.channelId === channelId);
      if (!session) return;

      if (session.tmuxWindowId && session.tmuxSession) {
        void reconcileTmux(hostId, session.tmuxSession);
        return;
      }

      setSessionsByHost((current) => ({
        ...current,
        [hostId]: (current[hostId] ?? []).filter(
          (item) => item.id !== session.id,
        ),
      }));
      setActiveSessionByHost((current) => {
        if (current[hostId] !== session.id) return current;
        return { ...current, [hostId]: null };
      });
    },
    [reconcileTmux],
  );

  const removeSession = useCallback((hostId: string, sessionId: string) => {
    setSessionsByHost((current) => {
      const list = (current[hostId] ?? []).filter((s) => s.id !== sessionId);
      return { ...current, [hostId]: list };
    });
    setActiveSessionByHost((current) => {
      if (current[hostId] !== sessionId) return current;
      return { ...current, [hostId]: null };
    });
  }, []);

  const clearSessionsForHost = useCallback((hostId: string) => {
    setSessionsByHost((current) => ({ ...current, [hostId]: [] }));
    setActiveSessionByHost((current) => ({ ...current, [hostId]: null }));
  }, []);

  useEffect(() => {
    const targets = Object.entries(sessionsByHost)
      .map(([hostId, sessions]) => {
        const tmuxSession = sessions.find(
          (session) => session.tmuxSession,
        )?.tmuxSession;
        return tmuxSession ? { hostId, tmuxSession } : null;
      })
      .filter((item): item is { hostId: string; tmuxSession: string } =>
        Boolean(item),
      );

    if (targets.length === 0) return;

    const timer = window.setInterval(() => {
      for (const target of targets) {
        void reconcileTmux(target.hostId, target.tmuxSession);
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [reconcileTmux, sessionsByHost]);

  return {
    sessionsByHost,
    activeSessionByHost,
    bootstrapTmux,
    openShell,
    setSessionCwd,
    closeShell,
    killTmuxSession,
    selectShell,
    clearHostShells,
    removeHostShells,
    handleChannelClosed,
    removeSession,
    clearSessionsForHost,
  };
}

export function useActiveShellFallback(
  selectedId: string | null,
  sessionsByHost: Record<string, ShellSession[]>,
  activeSessionByHost: Record<string, string | null>,
  selectShell: (hostId: string, sessionId: string) => void,
) {
  useEffect(() => {
    if (!selectedId) return;
    const sessions = sessionsByHost[selectedId] ?? [];
    const active = activeSessionByHost[selectedId] ?? null;
    const activeExists =
      active != null && sessions.some((session) => session.id === active);
    if ((!active || !activeExists) && sessions[0]) {
      void selectShell(selectedId, sessions[0].id);
    }
  }, [selectedId, sessionsByHost, activeSessionByHost, selectShell]);
}
