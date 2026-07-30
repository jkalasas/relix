import { useCallback, useMemo, useRef, useState } from "react";
import { useAndroidBackground } from "@/features/android-background";
import type { useForwards } from "@/features/forwards";
import {
  type DisconnectChoice,
  type Host,
  type HostConfig,
  useHosts,
} from "@/features/hosts";
import type { useProjects } from "@/features/projects";
import type { useSessionTabs } from "@/features/session-tabs";
import { DEFAULT_TMUX_SESSION, type useShells } from "@/features/shells";

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

  const sessionTabsRef = useRef(sessionTabs);
  sessionTabsRef.current = sessionTabs;

  const onConnected = useCallback(
    async (host: HostConfig) => {
      await forwards.autoStartForwards(host.id);
      if (host.shellMode === "tmux") {
        await shells.bootstrapTmux(host.id, host.tmuxSession);
      }
    },
    [forwards.autoStartForwards, shells.bootstrapTmux],
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

  return {
    hosts,
    androidBackground,
    disconnectPrompt,
    disconnectBusy,
    requestDisconnect,
    confirmDisconnect,
    clearDisconnectPrompt,
  };
}
