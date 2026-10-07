import { useCallback, useEffect, useRef } from "react";
import {
  NOTIFY_EVENTS_PATH,
  NOTIFY_HEALTH_PATH,
  NOTIFY_LOCAL_HOST,
  NOTIFY_PORT,
  NOTIFY_REMOTE_HOST,
  notifyForwardId,
} from "@/features/notify/constants";
import { parseNotifyPayload, parseSseDataLine } from "@/features/notify/lib/parse";
import type { NotifyPayload } from "@/features/notify/types";
import { isLocalHostId } from "@/features/hosts";
import { parseSshError, sshStartLocalForward, sshStopForward } from "@/features/ssh";

type RelayState = {
  /** Null for the local host — no SSH forward, direct loopback dial. */
  forwardId: string | null;
  localPort: number;
  source: EventSource;
  seen: Set<string>;
};

type UseNotifyRelayOptions = {
  /** Host ids currently connected. Relay ensures one ephemeral forward each. */
  connectedHostIds: string[];
  onNotify: (payload: NotifyPayload, hostId: string) => void;
  /** Ms between retries for connected hosts still missing a relay. */
  retryMs?: number;
};

function relayBase(localPort: number): string {
  return `http://${NOTIFY_LOCAL_HOST}:${localPort}`;
}

/** Null when reachable; otherwise the human-readable reason (logged, never toasted). */
async function probeRelay(localPort: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(`${relayBase(localPort)}${NOTIFY_HEALTH_PATH}`, {
        signal: controller.signal,
      });
      return res.ok ? null : `healthz status ${res.status}`;
    } finally {
      window.clearTimeout(timer);
    }
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? "healthz timed out"
      : `healthz failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Starts the ephemeral notify forward, clearing one stale same-id
 * forward first. Throws the underlying SSH error when no forward
 * can be established (host raced disconnect, relay unreachable).
 */
async function startNotifyForward(
  hostId: string,
  forwardId: string,
): Promise<number> {
  const config = {
    hostId,
    forwardId,
    localHost: NOTIFY_LOCAL_HOST,
    localPort: 0,
    remoteHost: NOTIFY_REMOTE_HOST,
    remotePort: NOTIFY_PORT,
  };
  try {
    return (await sshStartLocalForward(config)).localPort;
  } catch (error) {
    if (!parseSshError(error).message.includes("already active")) {
      throw error;
    }
  }
  try {
    await sshStopForward(forwardId);
  } catch {
    // still listed but unstoppable — host raced disconnect; retry below anyway
  }
  return (await sshStartLocalForward(config)).localPort;
}

function parseEventData(data: unknown): NotifyPayload | null {
  const text = String(data ?? "");
  // Accept both raw SSE frames (`data: {...}`) and bare JSON (EventSource strips the prefix).
  return (
    parseSseDataLine(text) ??
    (() => {
      try {
        return parseNotifyPayload(JSON.parse(text));
      } catch {
        return null;
      }
    })()
  );
}

export function useNotifyRelay({
  connectedHostIds,
  onNotify,
  retryMs = 10_000,
}: UseNotifyRelayOptions) {
  const relaysRef = useRef(new Map<string, RelayState>());
  const inflightRef = useRef(new Set<string>());
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const stop = useCallback(async (hostId: string) => {
    const relay = relaysRef.current.get(hostId);
    if (!relay) return;
    relaysRef.current.delete(hostId);
    console.debug(`[notify] ${hostId}: stopping relay (was :${relay.localPort})`);
    try {
      relay.source.close();
    } catch {
      // already closed
    }
    if (relay.forwardId) {
      try {
        await sshStopForward(relay.forwardId);
      } catch {
        // ephemeral — still drop locally
      }
    }
  }, []);

  const ensure = useCallback(async (hostId: string) => {
    if (relaysRef.current.has(hostId) || inflightRef.current.has(hostId)) return;
    inflightRef.current.add(hostId);
    try {
      // Local host has no SSH connection — dial the relay directly.
      const direct = isLocalHostId(hostId);
      const forwardId = direct ? null : notifyForwardId(hostId);
      let localPort = direct ? NOTIFY_PORT : 0;
      if (!direct) {
        try {
          localPort = await startNotifyForward(hostId, forwardId as string);
        } catch (error) {
          // Host raced disconnect — retry on the next tick, still no toast.
          console.warn(
            `[notify] ${hostId}: forward failed (${parseSshError(error).message}), will retry`,
          );
          return;
        }
        if (!localPort) {
          console.debug(`[notify] ${hostId}: no bound port, will retry`);
          try {
            await sshStopForward(forwardId as string);
          } catch {
            // ignore
          }
          return;
        }
      }
      // Relay absent (or on the wrong machine) → tear down silently,
      // retry later. No toast: a missing relay is the normal case.
      const probeProblem = await probeRelay(localPort);
      if (probeProblem) {
        console.warn(
          `[notify] ${hostId}: relay not reachable via :${localPort} (${probeProblem}) — is relix-notify running ${direct ? "locally" : "on the SSH host"}? On Android also check loopback cleartext. Will retry`,
        );
        if (forwardId) {
          try {
            await sshStopForward(forwardId);
          } catch {
            // ignore
          }
        }
        return;
      }
      const seen = new Set<string>();
      let source: EventSource;
      try {
        source = new EventSource(`${relayBase(localPort)}${NOTIFY_EVENTS_PATH}`);
      } catch (error) {
        console.warn(
          `[notify] ${hostId}: EventSource failed (${error instanceof Error ? error.message : String(error)}), will retry`,
        );
        if (forwardId) {
          try {
            await sshStopForward(forwardId);
          } catch {
            // ignore
          }
        }
        return;
      }
      source.onopen = () => {
        console.debug(`[notify] ${hostId}: subscribed via :${localPort}`);
      };
      source.onmessage = (event) => {
        const payload = parseEventData(event.data);
        if (!payload || seen.has(payload.id)) return;
        seen.add(payload.id);
        onNotifyRef.current(payload, hostId);
      };
      source.onerror = () => {
        // Relay went away — keep the forward until disconnect; browser retries.
        console.debug(`[notify] ${hostId}: event stream error, browser will retry`);
      };
      relaysRef.current.set(hostId, { forwardId, localPort, source, seen });
    } finally {
      inflightRef.current.delete(hostId);
    }
  }, []);

  useEffect(() => {
    const wanted = new Set(connectedHostIds);
    for (const hostId of wanted) {
      void ensure(hostId);
    }
    for (const hostId of [...relaysRef.current.keys()]) {
      if (!wanted.has(hostId)) {
        void stop(hostId);
      }
    }
  }, [connectedHostIds, ensure, stop]);

  // The relay may start after Relix connects (or restart mid-session), so keep
  // retrying connected hosts that still have no relay. Silent by design.
  useEffect(() => {
    if (connectedHostIds.length === 0) return;
    const timer = window.setInterval(() => {
      for (const hostId of connectedHostIds) {
        if (!relaysRef.current.has(hostId)) {
          void ensure(hostId);
        }
      }
    }, retryMs);
    return () => window.clearInterval(timer);
  }, [connectedHostIds, ensure, retryMs]);

  useEffect(() => {
    const relays = relaysRef.current;
    return () => {
      for (const relay of relays.values()) {
        try {
          relay.source.close();
        } catch {
          // ignore
        }
        if (relay.forwardId) {
          void sshStopForward(relay.forwardId).catch(() => {});
        }
      }
      relays.clear();
    };
  }, []);

  return { ensureNotifyRelay: ensure, stopNotifyRelay: stop };
}
