import { useEffect, useRef } from "react";
import type { Host } from "@/features/hosts";

/**
 * Auto-reconnects hosts that dropped unexpectedly.
 * Retries only `error` hosts, with exponential backoff, pausing while offline.
 */
export function useReconnect({
  hosts,
  connectingId,
  connectHost,
}: {
  hosts: Host[];
  connectingId: string | null;
  connectHost: (hostId: string) => void;
}) {
  const attemptsRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, number>());
  const connectHostRef = useRef(connectHost);
  connectHostRef.current = connectHost;
  const connectingRef = useRef(connectingId);
  connectingRef.current = connectingId;
  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;

  function clearTimer(hostId: string) {
    const timer = timersRef.current.get(hostId);
    if (timer != null) {
      window.clearTimeout(timer);
      timersRef.current.delete(hostId);
    }
  }

  function backoffMs(attempt: number): number {
    const delays = [1000, 2000, 5000, 15000, 30000];
    return delays[Math.min(attempt, delays.length - 1)];
  }

  function schedule(hostId: string) {
    if (timersRef.current.has(hostId)) return;
    if (connectingRef.current === hostId) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const attempt = attemptsRef.current.get(hostId) ?? 0;
    const delay = backoffMs(attempt);
    const timer = window.setTimeout(() => {
      timersRef.current.delete(hostId);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      attemptsRef.current.set(hostId, attempt + 1);
      connectHostRef.current(hostId);
    }, delay);
    timersRef.current.set(hostId, timer);
  }

  useEffect(() => {
    for (const host of hosts) {
      if (host.status === "error") {
        schedule(host.id);
      } else {
        attemptsRef.current.delete(host.id);
        clearTimer(host.id);
      }
    }
  }, [hosts]);

  useEffect(() => {
    function wake() {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
      attemptsRef.current.clear();
      for (const host of hostsRef.current) {
        if (host.status === "error") {
          schedule(host.id);
        }
      }
    }
    function onOnline() {
      wake();
    }
    function onVisible() {
      if (document.visibilityState === "visible") wake();
    }
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", wake);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", wake);
    };
  }, []);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    },
    [],
  );
}
