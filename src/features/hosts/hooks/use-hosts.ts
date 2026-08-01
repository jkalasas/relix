import { useCallback, useEffect, useState } from "react";
import type { AuthCheckPrompt } from "@/features/hosts/components/auth-check-dialog";
import { toHostConfig } from "@/features/hosts/lib/convert";
import {
  isLocalHostId,
  withLocalHost,
  withoutLocalHost,
} from "@/features/hosts/lib/local-host";
import { saveHostConfigs } from "@/features/hosts/store";
import type { Host, HostConfig } from "@/features/hosts/types";
import {
  listenSshAuthBanner,
  parseSshError,
  sshCancelConnect,
  sshConnect,
  sshDisconnect,
  sshTrustHostKey,
  type SshCommandError,
} from "@/features/ssh";

type UseHostsOptions = {
  onConnected?: (host: HostConfig) => void | Promise<void>;
  onDisconnecting?: (hostId: string) => void | Promise<void>;
  onDeleted?: (hostId: string) => void;
  ensureBackgroundReady?: () => Promise<boolean>;
};

export function useHosts(options: UseHostsOptions = {}) {
  const { onConnected, onDisconnecting, onDeleted, ensureBackgroundReady } =
    options;

  const [hosts, setHosts] = useState<Host[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [hostKeyError, setHostKeyError] = useState<SshCommandError | null>(null);
  const [pendingTrustHostId, setPendingTrustHostId] = useState<string | null>(
    null,
  );
  const [authCheck, setAuthCheck] = useState<AuthCheckPrompt | null>(null);
  const [booting, setBooting] = useState(true);
  const [localAvailable, setLocalAvailable] = useState(false);

  const persistHosts = useCallback(async (next: Host[]) => {
    await saveHostConfigs(withoutLocalHost(next).map(toHostConfig));
  }, []);

  const replaceHosts = useCallback(
    (hosts: Host[], available = localAvailable) => {
      setLocalAvailable(available);
      setHosts(withLocalHost(withoutLocalHost(hosts), available));
    },
    [localAvailable],
  );

  const setHostStatus = useCallback(
    (id: string, status: Host["status"], lastError?: string) => {
      if (isLocalHostId(id)) return;
      setHosts((current) =>
        current.map((host) =>
          host.id === id
            ? {
                ...host,
                status,
                lastError:
                  status === "error"
                    ? (lastError ?? host.lastError)
                    : undefined,
              }
            : host,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const fn = await listenSshAuthBanner((event) => {
        const checkUrl = event.checkUrl ?? undefined;
        setAuthCheck((current) => {
          if (current && current.hostId !== event.hostId) {
            return current;
          }
          const message = [current?.message, event.message]
            .filter((part) => part && part.trim().length > 0)
            .join("\n")
            .trim();
          return {
            hostId: event.hostId,
            message: message || event.message,
            checkUrl: checkUrl || current?.checkUrl,
          };
        });
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

  const connectHost = useCallback(
    async (id: string) => {
      if (isLocalHostId(id)) return;
      const host = hosts.find((item) => item.id === id);
      if (!host) return;
      if (ensureBackgroundReady) {
        const ready = await ensureBackgroundReady();
        if (!ready) return;
      }
      setConnectingId(id);
      setHostKeyError(null);
      setAuthCheck(null);
      try {
        await sshConnect(host);
        setAuthCheck(null);
        setHostStatus(id, "connected");
        try {
          await onConnected?.(toHostConfig(host));
        } catch (postError) {
          const parsed = parseSshError(postError);
          try {
            await sshDisconnect(id);
          } catch {
            // still surface the post-connect failure
          }
          setHostStatus(id, "error", parsed.message);
          await onDisconnecting?.(id);
        }
      } catch (error) {
        const parsed = parseSshError(error);
        setAuthCheck(null);
        if (
          parsed.code === "host_key_unknown" ||
          parsed.code === "host_key_changed"
        ) {
          setHostKeyError(parsed);
          setPendingTrustHostId(id);
        } else if (parsed.message !== "Authentication cancelled") {
          setHostStatus(id, "error", parsed.message);
        } else {
          setHostStatus(id, "idle");
        }
      } finally {
        setConnectingId(null);
      }
    },
    [ensureBackgroundReady, hosts, onConnected, onDisconnecting, setHostStatus],
  );

  const acceptHostKey = useCallback(async () => {
    if (!hostKeyError || !pendingTrustHostId) return;
    if (
      !hostKeyError.hostname ||
      hostKeyError.port == null ||
      !hostKeyError.algorithm ||
      !hostKeyError.keyBase64
    ) {
      setHostKeyError(null);
      return;
    }
    setConnectingId(pendingTrustHostId);
    try {
      await sshTrustHostKey({
        hostname: hostKeyError.hostname,
        port: hostKeyError.port,
        algorithm: hostKeyError.algorithm,
        keyBase64: hostKeyError.keyBase64,
      });
      setHostKeyError(null);
      const hostId = pendingTrustHostId;
      setPendingTrustHostId(null);
      await connectHost(hostId);
    } catch {
      setHostStatus(pendingTrustHostId, "error");
      setHostKeyError(null);
      setPendingTrustHostId(null);
    } finally {
      setConnectingId(null);
    }
  }, [connectHost, hostKeyError, pendingTrustHostId, setHostStatus]);

  const cancelHostKey = useCallback(() => {
    setHostKeyError(null);
    setPendingTrustHostId(null);
  }, []);

  const cancelAuthCheck = useCallback(async () => {
    const hostId = authCheck?.hostId ?? connectingId;
    setAuthCheck(null);
    if (!hostId) return;
    try {
      await sshCancelConnect(hostId);
    } catch {
      // ignore
    }
  }, [authCheck?.hostId, connectingId]);

  const disconnectHost = useCallback(
    async (id: string) => {
      if (isLocalHostId(id)) return;
      await onDisconnecting?.(id);
      try {
        await sshDisconnect(id);
      } catch {
        // ignore
      }
      setHostStatus(id, "idle");
    },
    [onDisconnecting, setHostStatus],
  );

  const saveHost = useCallback(
    async (config: HostConfig) => {
      if (isLocalHostId(config.id)) return;
      setHosts((current) => {
        const remotes = withoutLocalHost(current);
        const exists = remotes.some((host) => host.id === config.id);
        const nextRemotes = exists
          ? remotes.map((host) =>
              host.id === config.id
                ? { ...config, status: host.status }
                : host,
            )
          : [...remotes, { ...config, status: "idle" as const }];
        const next = withLocalHost(nextRemotes, localAvailable);
        void persistHosts(next);
        return next;
      });
    },
    [localAvailable, persistHosts],
  );

  const deleteHost = useCallback(
    async (id: string) => {
      if (isLocalHostId(id)) return;
      await disconnectHost(id);
      setHosts((current) => {
        const next = withLocalHost(
          withoutLocalHost(current).filter((host) => host.id !== id),
          localAvailable,
        );
        void persistHosts(next);
        return next;
      });
      onDeleted?.(id);
    },
    [disconnectHost, localAvailable, onDeleted, persistHosts],
  );

  return {
    hosts,
    setHosts: replaceHosts,
    booting,
    setBooting,
    connectingId,
    hostKeyError,
    authCheck,
    setHostStatus,
    connectHost,
    acceptHostKey,
    cancelHostKey,
    cancelAuthCheck,
    disconnectHost,
    saveHost,
    deleteHost,
  };
}
