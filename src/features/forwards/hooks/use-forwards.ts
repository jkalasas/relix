import { useCallback, useState } from "react";
import {
  configsToForwards,
  idleForwards,
  toPortForwardConfig,
} from "@/features/forwards/lib/format";
import {
  loadForwardsByHost,
  saveForwardsByHost,
} from "@/features/forwards/store";
import type { PortForward, PortForwardConfig } from "@/features/forwards/types";
import {
  parseSshError,
  sshStartDynamicForward,
  sshStartLocalForward,
  sshStartRemoteForward,
  sshStopForward,
} from "@/features/ssh";

function persistForwardMap(map: Record<string, PortForward[]>) {
  const configs: Record<string, PortForwardConfig[]> = {};
  for (const [hostId, list] of Object.entries(map)) {
    configs[hostId] = list.map(toPortForwardConfig);
  }
  return saveForwardsByHost(configs);
}

export function useForwards() {
  const [forwardsByHost, setForwardsByHost] = useState<
    Record<string, PortForward[]>
  >({});

  const loadForwards = useCallback(async (hostIds: string[]) => {
    const saved = await loadForwardsByHost();
    const forwards: Record<string, PortForward[]> = {};
    for (const hostId of hostIds) {
      forwards[hostId] = configsToForwards(saved[hostId] ?? []);
    }
    for (const hostId of Object.keys(saved)) {
      if (!(hostId in forwards)) {
        forwards[hostId] = configsToForwards(saved[hostId] ?? []);
      }
    }
    setForwardsByHost(forwards);
    return forwards;
  }, []);

  const markHostForwardsIdle = useCallback((hostId: string) => {
    setForwardsByHost((current) => {
      const list = current[hostId];
      if (!list || list.length === 0) return current;
      return { ...current, [hostId]: idleForwards(list) };
    });
  }, []);

  const updateForwardStatus = useCallback(
    (
      hostId: string,
      forwardId: string,
      status: PortForward["status"],
      errorMessage?: string,
    ) => {
      setForwardsByHost((current) => {
        const list = current[hostId];
        if (!list) return current;
        return {
          ...current,
          [hostId]: list.map((forward) =>
            forward.id === forwardId
              ? {
                  ...toPortForwardConfig(forward),
                  status,
                  errorMessage,
                }
              : forward,
          ),
        };
      });
    },
    [],
  );

  const startForward = useCallback(
    async (hostId: string, forward: PortForward) => {
      try {
        if (forward.type === "R") {
          await sshStartRemoteForward({
            hostId,
            forwardId: forward.id,
            localHost: forward.localHost,
            localPort: forward.localPort,
            remoteHost: forward.remoteHost,
            remotePort: forward.remotePort,
          });
        } else if (forward.type === "D") {
          await sshStartDynamicForward({
            hostId,
            forwardId: forward.id,
            localHost: forward.localHost,
            localPort: forward.localPort,
          });
        } else {
          await sshStartLocalForward({
            hostId,
            forwardId: forward.id,
            localHost: forward.localHost,
            localPort: forward.localPort,
            remoteHost: forward.remoteHost,
            remotePort: forward.remotePort,
          });
        }
        updateForwardStatus(hostId, forward.id, "active");
      } catch (error) {
        const parsed = parseSshError(error);
        updateForwardStatus(hostId, forward.id, "error", parsed.message);
      }
    },
    [updateForwardStatus],
  );

  const autoStartForwards = useCallback(
    async (hostId: string) => {
      const list = forwardsByHost[hostId] ?? [];
      const pending = list.filter(
        (forward) => forward.autoStart && forward.status !== "active",
      );
      await Promise.allSettled(
        pending.map((forward) => startForward(hostId, forward)),
      );
    },
    [forwardsByHost, startForward],
  );

  const stopForward = useCallback(
    async (hostId: string, forwardId: string) => {
      try {
        await sshStopForward(forwardId);
        updateForwardStatus(hostId, forwardId, "idle");
      } catch (error) {
        const parsed = parseSshError(error);
        if (parsed.code === "not_found") {
          updateForwardStatus(hostId, forwardId, "idle");
          return;
        }
        updateForwardStatus(hostId, forwardId, "error", parsed.message);
      }
    },
    [updateForwardStatus],
  );

  const saveForward = useCallback(
    (hostId: string, config: PortForwardConfig) => {
      setForwardsByHost((current) => {
        const list = current[hostId] ?? [];
        const exists = list.some((forward) => forward.id === config.id);
        const nextList: PortForward[] = exists
          ? list.map((forward) =>
              forward.id === config.id
                ? {
                    ...config,
                    status:
                      forward.status === "active"
                        ? ("active" as const)
                        : ("idle" as const),
                    errorMessage: undefined,
                  }
                : forward,
            )
          : [...list, { ...config, status: "idle" as const }];
        const next = { ...current, [hostId]: nextList };
        void persistForwardMap(next);
        return next;
      });
    },
    [],
  );

  const deleteForward = useCallback(
    async (hostId: string, forwardId: string) => {
      const existing = (forwardsByHost[hostId] ?? []).find(
        (forward) => forward.id === forwardId,
      );
      if (existing?.status === "active") {
        try {
          await sshStopForward(forwardId);
        } catch {
          // still remove locally
        }
      }
      setForwardsByHost((current) => {
        const next = {
          ...current,
          [hostId]: (current[hostId] ?? []).filter(
            (forward) => forward.id !== forwardId,
          ),
        };
        void persistForwardMap(next);
        return next;
      });
    },
    [forwardsByHost],
  );

  const ensureHostForwards = useCallback((hostId: string) => {
    setForwardsByHost((current) => {
      if (current[hostId]) return current;
      const next = { ...current, [hostId]: [] };
      void persistForwardMap(next);
      return next;
    });
  }, []);

  const removeHostForwards = useCallback((hostId: string) => {
    setForwardsByHost((current) => {
      const next = { ...current };
      delete next[hostId];
      void persistForwardMap(next);
      return next;
    });
  }, []);

  const markForwardClosed = useCallback((hostId: string, forwardId: string) => {
    setForwardsByHost((current) => {
      const list = current[hostId];
      if (!list) return current;
      return {
        ...current,
        [hostId]: list.map((forward) =>
          forward.id === forwardId
            ? {
                ...toPortForwardConfig(forward),
                status: "idle" as const,
                errorMessage: undefined,
              }
            : forward,
        ),
      };
    });
  }, []);

  const markForwardError = useCallback(
    (hostId: string, forwardId: string, message: string) => {
      setForwardsByHost((current) => {
        const list = current[hostId];
        if (!list) return current;
        return {
          ...current,
          [hostId]: list.map((forward) =>
            forward.id === forwardId
              ? {
                  ...forward,
                  errorMessage: message,
                }
              : forward,
          ),
        };
      });
    },
    [],
  );

  return {
    forwardsByHost,
    loadForwards,
    markHostForwardsIdle,
    startForward,
    autoStartForwards,
    stopForward,
    saveForward,
    deleteForward,
    ensureHostForwards,
    removeHostForwards,
    markForwardClosed,
    markForwardError,
  };
}
