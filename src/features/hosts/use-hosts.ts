import { useCallback, useState } from "react";
import { toHostConfig } from "@/features/hosts/convert";
import { saveHostConfigs } from "@/features/hosts/store";
import type { Host, HostConfig } from "@/features/hosts/types";
import {
  parseSshError,
  sshConnect,
  sshDisconnect,
  sshTrustHostKey,
  type SshCommandError,
} from "@/features/ssh";

type UseHostsOptions = {
  onConnected?: (hostId: string) => void | Promise<void>;
  onDisconnecting?: (hostId: string) => void | Promise<void>;
  onDeleted?: (hostId: string) => void;
};

export function useHosts(options: UseHostsOptions = {}) {
  const { onConnected, onDisconnecting, onDeleted } = options;

  const [hosts, setHosts] = useState<Host[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [hostKeyError, setHostKeyError] = useState<SshCommandError | null>(null);
  const [pendingTrustHostId, setPendingTrustHostId] = useState<string | null>(
    null,
  );
  const [booting, setBooting] = useState(true);

  const persistHosts = useCallback(async (next: Host[]) => {
    await saveHostConfigs(next.map(toHostConfig));
  }, []);

  const setHostStatus = useCallback((id: string, status: Host["status"]) => {
    setHosts((current) =>
      current.map((host) => (host.id === id ? { ...host, status } : host)),
    );
  }, []);

  const connectHost = useCallback(
    async (id: string) => {
      const host = hosts.find((item) => item.id === id);
      if (!host) return;
      setConnectingId(id);
      setHostKeyError(null);
      try {
        await sshConnect(host);
        setHostStatus(id, "connected");
        await onConnected?.(id);
      } catch (error) {
        const parsed = parseSshError(error);
        if (
          parsed.code === "host_key_unknown" ||
          parsed.code === "host_key_changed"
        ) {
          setHostKeyError(parsed);
          setPendingTrustHostId(id);
        } else {
          setHostStatus(id, "error");
        }
      } finally {
        setConnectingId(null);
      }
    },
    [hosts, onConnected, setHostStatus],
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

  const disconnectHost = useCallback(
    async (id: string) => {
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
      setHosts((current) => {
        const exists = current.some((host) => host.id === config.id);
        const next = exists
          ? current.map((host) =>
              host.id === config.id
                ? { ...config, status: host.status }
                : host,
            )
          : [...current, { ...config, status: "idle" as const }];
        void persistHosts(next);
        return next;
      });
    },
    [persistHosts],
  );

  const deleteHost = useCallback(
    async (id: string) => {
      await disconnectHost(id);
      setHosts((current) => {
        const next = current.filter((host) => host.id !== id);
        void persistHosts(next);
        return next;
      });
      onDeleted?.(id);
    },
    [disconnectHost, onDeleted, persistHosts],
  );

  return {
    hosts,
    setHosts,
    booting,
    setBooting,
    connectingId,
    hostKeyError,
    setHostStatus,
    connectHost,
    acceptHostKey,
    cancelHostKey,
    disconnectHost,
    saveHost,
    deleteHost,
  };
}
