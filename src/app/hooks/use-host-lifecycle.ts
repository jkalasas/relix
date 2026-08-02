import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAndroidBackground } from "@/features/android-background";
import type { useForwards } from "@/features/forwards";
import {
  LOCAL_HOST_ID,
  type DisconnectChoice,
  type Host,
  type HostConfig,
  useHosts,
} from "@/features/hosts";
import { adhocWorkspaceId, type useProjects } from "@/features/projects";
import type { useSessionTabs } from "@/features/session-tabs";
import { DEFAULT_TMUX_SESSION, type useShells } from "@/features/shells";
import { appQuit, listenAppQuitRequested } from "@/features/ssh";

type UseHostLifecycleOptions = {
  forwards: ReturnType<typeof useForwards>;
  shells: ReturnType<typeof useShells>;
  sessionTabs: ReturnType<typeof useSessionTabs>;
  projects: ReturnType<typeof useProjects>;
};

export function useHostLifecycle({
  forwards,
  shells,
  sessionTabs,
  projects,
}: UseHostLifecycleOptions) {
  const [disconnectPrompt, setDisconnectPrompt] = useState<{
    hostId: string;
    sessionName: string;
  } | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [quitPrompt, setQuitPrompt] = useState<{
    sessionName: string;
  } | null>(null);
  const [quitBusy, setQuitBusy] = useState(false);

  const sessionTabsRef = useRef(sessionTabs);
  sessionTabsRef.current = sessionTabs;

  const onConnected = useCallback(
    async (host: HostConfig) => {
      try {
        await projects.syncHostProjects(host.id);
      } catch {
        // cache remains until a later successful sync
      }
      await forwards.autoStartForwards(host.id);
    },
    [forwards.autoStartForwards, projects.syncHostProjects],
  );

  const onDisconnecting = useCallback(
    async (hostId: string) => {
      await shells.clearHostShells(hostId);
      forwards.markHostForwardsIdle(hostId);
      sessionTabsRef.current.clearHost(hostId);
    },
    [forwards.markHostForwardsIdle, shells.clearHostShells],
  );

  const onDeleted = useCallback(
    (hostId: string) => {
      forwards.removeHostForwards(hostId);
      shells.removeHostShells(hostId);
      sessionTabsRef.current.removeHost(hostId);
      void projects.removeHostProjects(hostId);
    },
    [
      forwards.removeHostForwards,
      projects.removeHostProjects,
      shells.removeHostShells,
    ],
  );

  const ensureBackgroundReadyRef = useRef<() => Promise<boolean>>(
    async () => true,
  );
  const ensureBackgroundReady = useCallback(
    () => ensureBackgroundReadyRef.current(),
    [],
  );

  const hosts = useHosts({
    onConnected,
    onDisconnecting,
    onDeleted,
    ensureBackgroundReady,
  });

  const bootstrapLocalTmux = useCallback(async () => {
    await shells.bootstrapTmux(
      adhocWorkspaceId(LOCAL_HOST_ID),
      LOCAL_HOST_ID,
    );
  }, [shells.bootstrapTmux]);

  const connectedCount = useMemo(
    () => hosts.hosts.filter((host) => host.status === "connected").length,
    [hosts.hosts],
  );

  const killAllSessions = useCallback(async () => {
    const connected = hosts.hosts.filter((host) => host.status === "connected");
    for (const host of connected) {
      await hosts.disconnectHost(host.id);
    }
  }, [hosts.disconnectHost, hosts.hosts]);

  const androidBackground = useAndroidBackground({
    connectedCount,
    onKillSessions: killAllSessions,
  });

  ensureBackgroundReadyRef.current = androidBackground.ensureReady;

  const requestDisconnect = useCallback(
    (host: Host) => {
      if (host.shellMode === "tmux") {
        setDisconnectPrompt({
          hostId: host.id,
          sessionName: host.tmuxSession?.trim() || DEFAULT_TMUX_SESSION,
        });
        return;
      }
      void hosts.disconnectHost(host.id);
    },
    [hosts.disconnectHost],
  );

  const confirmDisconnect = useCallback(
    async (choice: DisconnectChoice) => {
      if (!disconnectPrompt) return;
      const { hostId, sessionName } = disconnectPrompt;
      setDisconnectBusy(true);
      try {
        if (choice === "kill") {
          try {
            await shells.killTmuxSession(hostId, sessionName);
          } catch {
            // still disconnect the SSH link
          }
        }
        await hosts.disconnectHost(hostId);
        setDisconnectPrompt(null);
      } finally {
        setDisconnectBusy(false);
      }
    },
    [disconnectPrompt, hosts.disconnectHost, shells.killTmuxSession],
  );

  const clearDisconnectPrompt = useCallback(() => {
    setDisconnectPrompt(null);
  }, []);

  const exitApp = useCallback(async () => {
    try {
      await appQuit();
    } catch {
      // desktop-only command; ignore when unavailable
    }
  }, []);

  const confirmQuit = useCallback(
    async (choice: DisconnectChoice) => {
      if (!quitPrompt) return;
      const { sessionName } = quitPrompt;
      setQuitBusy(true);
      try {
        if (choice === "kill") {
          try {
            await shells.killTmuxSession(LOCAL_HOST_ID, sessionName);
          } catch {
            // still quit
          }
        }
        setQuitPrompt(null);
        await exitApp();
      } finally {
        setQuitBusy(false);
      }
    },
    [exitApp, quitPrompt, shells.killTmuxSession],
  );

  const clearQuitPrompt = useCallback(() => {
    if (quitBusy) return;
    setQuitPrompt(null);
  }, [quitBusy]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listenAppQuitRequested(() => {
      if (cancelled) return;
      const localAvailable = hosts.hosts.some((host) => host.id === LOCAL_HOST_ID);
      if (!localAvailable) {
        void exitApp();
        return;
      }
      setQuitPrompt({ sessionName: DEFAULT_TMUX_SESSION });
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [exitApp, hosts.hosts]);

  return {
    hosts,
    androidBackground,
    disconnectPrompt,
    disconnectBusy,
    requestDisconnect,
    confirmDisconnect,
    clearDisconnectPrompt,
    bootstrapLocalTmux,
    quitPrompt,
    quitBusy,
    confirmQuit,
    clearQuitPrompt,
  };
}
