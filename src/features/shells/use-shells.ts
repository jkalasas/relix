import { useCallback, useEffect, useState } from "react";
import {
  nextSessionTitle,
  shellLaunchById,
  type ShellLaunchId,
} from "@/features/shells/launch";
import type { ShellSession } from "@/features/shells/types";
import { sshCloseShell, sshOpenShell } from "@/features/ssh";

type UseShellsOptions = {
  onOpenFailed?: (hostId: string) => void;
};

export function useShells(options: UseShellsOptions = {}) {
  const { onOpenFailed } = options;

  const [sessionsByHost, setSessionsByHost] = useState<
    Record<string, ShellSession[]>
  >({});
  const [activeSessionByHost, setActiveSessionByHost] = useState<
    Record<string, string | null>
  >({});

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
      } catch (error) {
        onOpenFailed?.(hostId);
        throw error;
      }
    },
    [activeSessionByHost, onOpenFailed, sessionsByHost],
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

  const selectShell = useCallback((hostId: string, sessionId: string) => {
    setActiveSessionByHost((current) => ({
      ...current,
      [hostId]: sessionId,
    }));
  }, []);

  const clearHostShells = useCallback(async (hostId: string) => {
    const sessions = sessionsByHost[hostId] ?? [];
    for (const session of sessions) {
      try {
        await sshCloseShell(session.id);
      } catch {
        // ignore
      }
    }
    setSessionsByHost((current) => ({ ...current, [hostId]: [] }));
    setActiveSessionByHost((current) => ({ ...current, [hostId]: null }));
  }, [sessionsByHost]);

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

  return {
    sessionsByHost,
    activeSessionByHost,
    openShell,
    setSessionCwd,
    closeShell,
    selectShell,
    clearHostShells,
    removeHostShells,
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
    if (!active && sessions[0]) {
      selectShell(selectedId, sessions[0].id);
    }
  }, [selectedId, sessionsByHost, activeSessionByHost, selectShell]);
}
