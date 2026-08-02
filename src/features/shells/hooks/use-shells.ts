import { useCallback, useEffect, useRef, useState } from "react";
import type { ShellMode } from "@/features/hosts";
import { isWorkspaceForHost } from "@/features/projects";
import {
  launchBaseTitle,
  nextSessionTitle,
  shellLaunchById,
  type ShellLaunchId,
} from "@/features/shells/lib/launch";
import {
  resolveTmuxBase,
  tmuxSessionForWorkspace,
} from "@/features/shells/lib/tmux-session";
import type { ShellSession } from "@/features/shells/types";
import {
  sshCloseShell,
  sshOpenShell,
  sshTmuxBootstrap,
  sshTmuxKillBaseTree,
  sshTmuxKillWindow,
  sshTmuxListWindows,
  sshTmuxMoveWindow,
  sshTmuxNewWindow,
  tmuxAttachCommand,
  type TmuxWindow,
} from "@/features/ssh";

export type ShellHostOptions = {
  shellMode?: ShellMode;
  tmuxSession?: string;
  cwd?: string;
};

type UseShellsOptions = {
  onOpenFailed?: (hostId: string) => void;
};

async function closeChannel(channelId?: string) {
  if (!channelId) return;
  try {
    await sshCloseShell(channelId);
  } catch {
    // still drop locally
  }
}

function workspaceIdsForHost(
  map: Record<string, unknown>,
  hostId: string,
): string[] {
  return Object.keys(map).filter((id) => isWorkspaceForHost(id, hostId));
}

function findSessionLocation(
  sessionsByWorkspace: Record<string, ShellSession[]>,
  predicate: (session: ShellSession) => boolean,
): { workspaceId: string; session: ShellSession } | null {
  for (const [workspaceId, sessions] of Object.entries(sessionsByWorkspace)) {
    const session = sessions.find(predicate);
    if (session) return { workspaceId, session };
  }
  return null;
}

function mergeTmuxSessions(
  hostId: string,
  workspaceId: string,
  tmuxSession: string,
  existing: ShellSession[],
  windows: TmuxWindow[],
): { sessions: ShellSession[]; deadChannels: string[] } {
  const byWindowId = new Map(windows.map((window) => [window.id, window]));
  const priorByWindow = new Map(
    existing
      .filter((session) => session.tmuxWindowId)
      .map((session) => [session.tmuxWindowId!, session]),
  );
  const sessions: ShellSession[] = [];
  const seen = new Set<string>();

  for (const prior of existing) {
    if (!prior.tmuxWindowId) continue;
    const window = byWindowId.get(prior.tmuxWindowId);
    if (!window) continue;
    seen.add(window.id);
    sessions.push({
      ...prior,
      title: window.name || prior.title,
      tmuxSession,
      workspaceId,
    });
  }

  for (const window of windows) {
    if (seen.has(window.id)) continue;
    sessions.push({
      id: crypto.randomUUID(),
      hostId,
      workspaceId,
      title: window.name,
      tmuxWindowId: window.id,
      tmuxSession,
    });
  }

  const deadChannels = [...priorByWindow.entries()]
    .filter(([windowId]) => !byWindowId.has(windowId))
    .map(([, session]) => session.channelId)
    .filter((id): id is string => Boolean(id));

  return { sessions, deadChannels };
}

export function useShells(options: UseShellsOptions = {}) {
  const { onOpenFailed } = options;

  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<
    Record<string, ShellSession[]>
  >({});
  const [activeSessionByWorkspace, setActiveSessionByWorkspace] = useState<
    Record<string, string | null>
  >({});
  const sessionsByWorkspaceRef = useRef(sessionsByWorkspace);
  sessionsByWorkspaceRef.current = sessionsByWorkspace;
  const activeSessionByWorkspaceRef = useRef(activeSessionByWorkspace);
  activeSessionByWorkspaceRef.current = activeSessionByWorkspace;
  const bootstrapInflightRef = useRef(
    new Map<string, Promise<string | null>>(),
  );

  const attachTmuxWindow = useCallback(
    async (
      hostId: string,
      workspaceId: string,
      sessionId: string,
      tmuxSession: string,
      tmuxWindowId: string,
    ) => {
      const { sessionId: channelId } = await sshOpenShell(hostId, {
        command: tmuxAttachCommand(tmuxSession, tmuxWindowId),
      });
      const nextList = (sessionsByWorkspaceRef.current[workspaceId] ?? []).map(
        (session) =>
          session.id === sessionId ? { ...session, channelId } : session,
      );
      sessionsByWorkspaceRef.current = {
        ...sessionsByWorkspaceRef.current,
        [workspaceId]: nextList,
      };
      setSessionsByWorkspace((current) => {
        const list = current[workspaceId] ?? [];
        return {
          ...current,
          [workspaceId]: list.map((session) =>
            session.id === sessionId ? { ...session, channelId } : session,
          ),
        };
      });
      return channelId;
    },
    [],
  );

  const reconcileTmux = useCallback(
    async (workspaceId: string, hostId: string, tmuxSession: string) => {
      try {
        const result = await sshTmuxListWindows(hostId, tmuxSession);
        const existing = sessionsByWorkspaceRef.current[workspaceId] ?? [];
        const { sessions, deadChannels } = mergeTmuxSessions(
          hostId,
          workspaceId,
          result.session,
          existing,
          result.windows,
        );
        for (const channelId of deadChannels) {
          void closeChannel(channelId);
        }
        sessionsByWorkspaceRef.current = {
          ...sessionsByWorkspaceRef.current,
          [workspaceId]: sessions,
        };
        setSessionsByWorkspace((current) => ({
          ...current,
          [workspaceId]: sessions,
        }));
        setActiveSessionByWorkspace((current) => {
          const activeId = current[workspaceId];
          if (!activeId) return current;
          if (sessions.some((session) => session.id === activeId)) {
            return current;
          }
          return { ...current, [workspaceId]: sessions[0]?.id ?? null };
        });
        return sessions;
      } catch {
        return sessionsByWorkspaceRef.current[workspaceId] ?? [];
      }
    },
    [],
  );

  const bootstrapTmux = useCallback(
    async (
      workspaceId: string,
      hostId: string,
      tmuxSession?: string,
    ): Promise<string | null> => {
      const inflight = bootstrapInflightRef.current.get(workspaceId);
      if (inflight) return inflight;

      const run = (async (): Promise<string | null> => {
        const sessionName = tmuxSessionForWorkspace(
          resolveTmuxBase(tmuxSession),
          workspaceId,
        );
        try {
          const result = await sshTmuxBootstrap(hostId, sessionName);
          const existing = sessionsByWorkspaceRef.current[workspaceId] ?? [];
          const { sessions, deadChannels } = mergeTmuxSessions(
            hostId,
            workspaceId,
            result.session,
            existing,
            result.windows,
          );
          for (const channelId of deadChannels) {
            void closeChannel(channelId);
          }

          const priorActive = activeSessionByWorkspaceRef.current[workspaceId];
          const activeWindow =
            result.windows.find((window) => window.active) ?? result.windows[0];
          const preferredId =
            (priorActive &&
            sessions.some((session) => session.id === priorActive)
              ? priorActive
              : null) ??
            sessions.find((session) => session.channelId)?.id ??
            sessions.find(
              (session) => session.tmuxWindowId === activeWindow?.id,
            )?.id ??
            sessions[0]?.id ??
            null;

          sessionsByWorkspaceRef.current = {
            ...sessionsByWorkspaceRef.current,
            [workspaceId]: sessions,
          };
          setSessionsByWorkspace((current) => ({
            ...current,
            [workspaceId]: sessions,
          }));

          activeSessionByWorkspaceRef.current = {
            ...activeSessionByWorkspaceRef.current,
            [workspaceId]: preferredId,
          };
          setActiveSessionByWorkspace((current) => ({
            ...current,
            [workspaceId]: preferredId,
          }));

          const toAttach = sessions.find(
            (session) => session.id === preferredId,
          );
          if (toAttach?.tmuxWindowId && !toAttach.channelId) {
            await attachTmuxWindow(
              hostId,
              workspaceId,
              toAttach.id,
              result.session,
              toAttach.tmuxWindowId,
            );
          }
          return preferredId;
        } catch (error) {
          onOpenFailed?.(hostId);
          throw error;
        }
      })();

      bootstrapInflightRef.current.set(workspaceId, run);
      try {
        return await run;
      } finally {
        if (bootstrapInflightRef.current.get(workspaceId) === run) {
          bootstrapInflightRef.current.delete(workspaceId);
        }
      }
    },
    [attachTmuxWindow, onOpenFailed],
  );

  const openShell = useCallback(
    async (
      workspaceId: string,
      hostId: string,
      launchId: ShellLaunchId = "shell",
      hostOptions: ShellHostOptions = {},
    ) => {
      const launch = shellLaunchById(launchId);
      const baseTitle = launchBaseTitle(launch);
      const shellMode = hostOptions.shellMode === "tmux" ? "tmux" : "plain";
      const tmuxSession = tmuxSessionForWorkspace(
        resolveTmuxBase(hostOptions.tmuxSession),
        workspaceId,
      );
      const activeId = activeSessionByWorkspace[workspaceId] ?? null;
      const activeSession = (sessionsByWorkspace[workspaceId] ?? []).find(
        (session) => session.id === activeId,
      );
      const cwd = hostOptions.cwd?.trim() || activeSession?.cwd;

      try {
        if (shellMode === "tmux") {
          const window = await sshTmuxNewWindow(hostId, {
            session: tmuxSession,
            name: baseTitle,
            command: launch.command,
            cwd,
            sourceWindowId: activeSession?.tmuxWindowId,
          });
          const sessionId = crypto.randomUUID();
          const next: ShellSession = {
            id: sessionId,
            hostId,
            workspaceId,
            title:
              window.name ||
              nextSessionTitle(
                sessionsByWorkspace[workspaceId] ?? [],
                baseTitle,
              ),
            cwd,
            tmuxWindowId: window.id,
            tmuxSession,
          };
          setSessionsByWorkspace((current) => {
            const existing = current[workspaceId] ?? [];
            return { ...current, [workspaceId]: [...existing, next] };
          });
          setActiveSessionByWorkspace((current) => ({
            ...current,
            [workspaceId]: sessionId,
          }));
          await attachTmuxWindow(
            hostId,
            workspaceId,
            sessionId,
            tmuxSession,
            window.id,
          );
          return sessionId;
        }

        const { sessionId: channelId } = await sshOpenShell(hostId, {
          command: launch.command,
          cwd,
        });
        const sessionId = crypto.randomUUID();
        setSessionsByWorkspace((current) => {
          const existing = current[workspaceId] ?? [];
          const next: ShellSession = {
            id: sessionId,
            hostId,
            workspaceId,
            title: nextSessionTitle(existing, baseTitle),
            cwd,
            channelId,
          };
          return { ...current, [workspaceId]: [...existing, next] };
        });
        setActiveSessionByWorkspace((current) => ({
          ...current,
          [workspaceId]: sessionId,
        }));
        return sessionId;
      } catch (error) {
        onOpenFailed?.(hostId);
        throw error;
      }
    },
    [
      activeSessionByWorkspace,
      attachTmuxWindow,
      onOpenFailed,
      sessionsByWorkspace,
    ],
  );

  const renameShell = useCallback(
    (workspaceId: string, sessionId: string, name: string) => {
      const trimmed = name.trim();
      setSessionsByWorkspace((current) => {
        const list = current[workspaceId] ?? [];
        let changed = false;
        const next = list.map((session) => {
          if (session.id !== sessionId) return session;
          if (!trimmed) {
            if (session.customTitle == null) return session;
            changed = true;
            const { customTitle: _removed, ...rest } = session;
            return rest;
          }
          if (session.customTitle === trimmed) return session;
          changed = true;
          return { ...session, customTitle: trimmed };
        });
        return changed ? { ...current, [workspaceId]: next } : current;
      });
    },
    [],
  );

  const setSessionCwd = useCallback((sessionId: string, cwd: string) => {
    setSessionsByWorkspace((current) => {
      let changed = false;
      const next: Record<string, ShellSession[]> = {};
      for (const [workspaceId, sessions] of Object.entries(current)) {
        next[workspaceId] = sessions.map((session) => {
          if (session.id !== sessionId || session.cwd === cwd) return session;
          changed = true;
          return { ...session, cwd };
        });
      }
      return changed ? next : current;
    });
  }, []);

  const closeShell = useCallback(
    async (workspaceId: string, hostId: string, sessionId: string) => {
      const session = (sessionsByWorkspaceRef.current[workspaceId] ?? []).find(
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
      setSessionsByWorkspace((current) => ({
        ...current,
        [workspaceId]: (current[workspaceId] ?? []).filter(
          (s) => s.id !== sessionId,
        ),
      }));
      setActiveSessionByWorkspace((current) => {
        if (current[workspaceId] !== sessionId) return current;
        return { ...current, [workspaceId]: null };
      });
    },
    [],
  );

  const killTmuxSession = useCallback(
    async (hostId: string, tmuxSession?: string) => {
      const workspaceIds = workspaceIdsForHost(
        sessionsByWorkspaceRef.current,
        hostId,
      );
      const allSessions = workspaceIds.flatMap(
        (workspaceId) => sessionsByWorkspaceRef.current[workspaceId] ?? [],
      );
      const baseSession = resolveTmuxBase(tmuxSession);
      try {
        await sshTmuxKillBaseTree(hostId, baseSession);
      } finally {
        for (const session of allSessions) {
          await closeChannel(session.channelId);
        }
        setSessionsByWorkspace((current) => {
          const next = { ...current };
          for (const workspaceId of workspaceIds) {
            next[workspaceId] = [];
          }
          return next;
        });
        setActiveSessionByWorkspace((current) => {
          const next = { ...current };
          for (const workspaceId of workspaceIds) {
            next[workspaceId] = null;
          }
          return next;
        });
      }
    },
    [],
  );

  const selectShell = useCallback(
    async (workspaceId: string, hostId: string, sessionId: string) => {
      const session = (sessionsByWorkspaceRef.current[workspaceId] ?? []).find(
        (item) => item.id === sessionId,
      );
      let sessions = sessionsByWorkspaceRef.current[workspaceId] ?? [];
      if (session?.tmuxSession) {
        sessions = await reconcileTmux(
          workspaceId,
          hostId,
          session.tmuxSession,
        );
      }

      const target =
        sessions.find((item) => item.id === sessionId) ??
        sessions.find(
          (item) => item.tmuxWindowId === session?.tmuxWindowId,
        ) ??
        sessions[0];

      if (!target) {
        setActiveSessionByWorkspace((current) => ({
          ...current,
          [workspaceId]: null,
        }));
        return;
      }

      setActiveSessionByWorkspace((current) => ({
        ...current,
        [workspaceId]: target.id,
      }));

      if (target.tmuxWindowId && target.tmuxSession && !target.channelId) {
        try {
          await attachTmuxWindow(
            hostId,
            workspaceId,
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
    const workspaceIds = workspaceIdsForHost(
      sessionsByWorkspaceRef.current,
      hostId,
    );
    for (const workspaceId of workspaceIds) {
      const sessions = sessionsByWorkspaceRef.current[workspaceId] ?? [];
      for (const session of sessions) {
        await closeChannel(session.channelId);
      }
    }
    setSessionsByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIds) {
        next[workspaceId] = [];
      }
      return next;
    });
    setActiveSessionByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIds) {
        next[workspaceId] = null;
      }
      return next;
    });
  }, []);

  const removeHostShells = useCallback((hostId: string) => {
    setSessionsByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdsForHost(next, hostId)) {
        delete next[workspaceId];
      }
      return next;
    });
    setActiveSessionByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdsForHost(next, hostId)) {
        delete next[workspaceId];
      }
      return next;
    });
  }, []);

  const removeWorkspaceShells = useCallback((workspaceId: string) => {
    setSessionsByWorkspace((current) => {
      if (!(workspaceId in current)) return current;
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
    setActiveSessionByWorkspace((current) => {
      if (!(workspaceId in current)) return current;
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
  }, []);

  const moveWorkspaceShells = useCallback(
    async (
      fromWorkspaceId: string,
      toWorkspaceId: string,
      hostOptions: ShellHostOptions = {},
    ) => {
      if (fromWorkspaceId === toWorkspaceId) return;

      const base = resolveTmuxBase(hostOptions.tmuxSession);
      const fromSessionName = tmuxSessionForWorkspace(base, fromWorkspaceId);
      const toSessionName = tmuxSessionForWorkspace(base, toWorkspaceId);
      const sessions =
        sessionsByWorkspaceRef.current[fromWorkspaceId] ?? [];

      const moved: ShellSession[] = [];
      for (const session of sessions) {
        let nextSession: ShellSession = {
          ...session,
          workspaceId: toWorkspaceId,
        };

        if (
          session.tmuxWindowId &&
          fromSessionName !== toSessionName
        ) {
          try {
            await sshTmuxMoveWindow(session.hostId, {
              fromSession: session.tmuxSession || fromSessionName,
              windowId: session.tmuxWindowId,
              toSession: toSessionName,
            });
          } catch {
            // still re-home locally; window may already be gone
          }
          await closeChannel(session.channelId);
          const { channelId: _removed, ...rest } = nextSession;
          nextSession = {
            ...rest,
            tmuxSession: toSessionName,
          };
        } else if (session.tmuxSession) {
          nextSession = { ...nextSession, tmuxSession: toSessionName };
        }

        moved.push(nextSession);
      }

      let nextActiveId: string | null = null;
      setActiveSessionByWorkspace((current) => {
        const next = { ...current };
        const activeFrom = next[fromWorkspaceId] ?? null;
        delete next[fromWorkspaceId];
        if (activeFrom && moved.some((session) => session.id === activeFrom)) {
          nextActiveId = activeFrom;
        } else if (next[toWorkspaceId]) {
          nextActiveId = next[toWorkspaceId] ?? null;
        } else {
          nextActiveId = moved[0]?.id ?? null;
        }
        next[toWorkspaceId] = nextActiveId;
        return next;
      });

      sessionsByWorkspaceRef.current = {
        ...sessionsByWorkspaceRef.current,
        [fromWorkspaceId]: [],
        [toWorkspaceId]: [
          ...(sessionsByWorkspaceRef.current[toWorkspaceId] ?? []),
          ...moved,
        ],
      };
      setSessionsByWorkspace((current) => {
        const next = { ...current };
        delete next[fromWorkspaceId];
        next[toWorkspaceId] = [
          ...(next[toWorkspaceId] ?? []),
          ...moved,
        ];
        return next;
      });

      const toAttach = moved.find((session) => session.id === nextActiveId);
      if (toAttach?.tmuxWindowId && toAttach.tmuxSession && !toAttach.channelId) {
        try {
          await attachTmuxWindow(
            toAttach.hostId,
            toWorkspaceId,
            toAttach.id,
            toAttach.tmuxSession,
            toAttach.tmuxWindowId,
          );
        } catch {
          onOpenFailed?.(toAttach.hostId);
        }
      }
    },
    [attachTmuxWindow, onOpenFailed],
  );

  const handleChannelClosed = useCallback(
    (hostId: string, channelId: string) => {
      const found = findSessionLocation(
        sessionsByWorkspaceRef.current,
        (session) =>
          session.hostId === hostId && session.channelId === channelId,
      );
      if (!found) return;

      const { workspaceId, session } = found;
      if (session.tmuxWindowId && session.tmuxSession) {
        void reconcileTmux(workspaceId, hostId, session.tmuxSession);
        return;
      }

      setSessionsByWorkspace((current) => ({
        ...current,
        [workspaceId]: (current[workspaceId] ?? []).filter(
          (item) => item.id !== session.id,
        ),
      }));
      setActiveSessionByWorkspace((current) => {
        if (current[workspaceId] !== session.id) return current;
        return { ...current, [workspaceId]: null };
      });
    },
    [reconcileTmux],
  );

  const clearSessionsForHost = useCallback((hostId: string) => {
    setSessionsByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdsForHost(next, hostId)) {
        next[workspaceId] = [];
      }
      return next;
    });
    setActiveSessionByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdsForHost(next, hostId)) {
        next[workspaceId] = null;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const targets: Array<{
      workspaceId: string;
      hostId: string;
      tmuxSession: string;
    }> = [];

    for (const [workspaceId, sessions] of Object.entries(sessionsByWorkspace)) {
      const tmuxSession = sessions.find(
        (session) => session.tmuxSession,
      )?.tmuxSession;
      const hostId = sessions[0]?.hostId;
      if (tmuxSession && hostId) {
        targets.push({ workspaceId, hostId, tmuxSession });
      }
    }

    if (targets.length === 0) return;

    const timer = window.setInterval(() => {
      for (const target of targets) {
        void reconcileTmux(
          target.workspaceId,
          target.hostId,
          target.tmuxSession,
        );
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [reconcileTmux, sessionsByWorkspace]);

  return {
    sessionsByWorkspace,
    activeSessionByWorkspace,
    bootstrapTmux,
    openShell,
    renameShell,
    setSessionCwd,
    closeShell,
    killTmuxSession,
    selectShell,
    clearHostShells,
    removeHostShells,
    removeWorkspaceShells,
    moveWorkspaceShells,
    handleChannelClosed,
    clearSessionsForHost,
  };
}

export function useActiveShellFallback(
  workspaceId: string | null,
  hostId: string | null,
  sessionsByWorkspace: Record<string, ShellSession[]>,
  activeSessionByWorkspace: Record<string, string | null>,
  selectShell: (
    workspaceId: string,
    hostId: string,
    sessionId: string,
  ) => void,
) {
  useEffect(() => {
    if (!workspaceId || !hostId) return;
    const sessions = sessionsByWorkspace[workspaceId] ?? [];
    const active = activeSessionByWorkspace[workspaceId] ?? null;
    const activeExists =
      active != null && sessions.some((session) => session.id === active);
    if ((!active || !activeExists) && sessions[0]) {
      void selectShell(workspaceId, hostId, sessions[0].id);
    }
  }, [
    workspaceId,
    hostId,
    sessionsByWorkspace,
    activeSessionByWorkspace,
    selectShell,
  ]);
}
