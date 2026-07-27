import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBackgroundReadiness,
  isAndroidPlatform,
  keepaliveRunning,
  listenKeepaliveStopped,
  openSystemBatterySettings,
  requestBatteryUnrestricted,
  requestNotifications,
  startKeepalive,
  stopKeepalive,
} from "@/features/android-background/api";
import type { BackgroundReadiness } from "@/features/android-background/types";

const IDLE_READINESS: BackgroundReadiness = {
  isAndroid: false,
  ready: true,
  notificationsGranted: true,
  batteryUnrestricted: true,
};

type UseAndroidBackgroundOptions = {
  connectedCount: number;
  onKillSessions: () => void | Promise<void>;
};

type DesiredKeepalive = {
  checked: boolean;
  isAndroid: boolean;
  ready: boolean;
  connectedCount: number;
};

function shouldRunKeepalive(desired: DesiredKeepalive): boolean {
  return (
    desired.checked &&
    desired.isAndroid &&
    desired.ready &&
    desired.connectedCount > 0
  );
}

export function useAndroidBackground({
  connectedCount,
  onKillSessions,
}: UseAndroidBackgroundOptions) {
  const [readiness, setReadiness] =
    useState<BackgroundReadiness>(IDLE_READINESS);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const killingRef = useRef(false);
  const onKillSessionsRef = useRef(onKillSessions);
  onKillSessionsRef.current = onKillSessions;

  const desiredRef = useRef<DesiredKeepalive>({
    checked: false,
    isAndroid: false,
    ready: true,
    connectedCount: 0,
  });
  desiredRef.current = {
    checked,
    isAndroid: readiness.isAndroid,
    ready: readiness.ready,
    connectedCount,
  };

  const syncChainRef = useRef(Promise.resolve());

  const enqueueKeepaliveSync = useCallback(() => {
    syncChainRef.current = syncChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const desired = desiredRef.current;
        if (!desired.checked || !desired.isAndroid) return;

        const wantRunning = shouldRunKeepalive(desired);
        try {
          if (wantRunning) {
            const running = await keepaliveRunning();
            if (!shouldRunKeepalive(desiredRef.current)) return;
            if (!running) {
              await startKeepalive();
            }
            return;
          }

          await stopKeepalive();
        } catch (error) {
          console.error("Relix keepalive sync failed", error);
        }
      });
  }, []);

  const refreshReadiness = useCallback(async () => {
    const next = await getBackgroundReadiness();
    setReadiness(next);
    if (next.isAndroid && !next.ready) {
      setSetupOpen(true);
    } else if (next.ready) {
      setSetupOpen(false);
    }
    setChecked(true);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refreshReadiness();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshReadiness]);

  useEffect(() => {
    if (!readiness.isAndroid) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshReadiness();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [readiness.isAndroid, refreshReadiness]);

  useEffect(() => {
    if (!readiness.isAndroid) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const fn = await listenKeepaliveStopped(async (reason) => {
        if (disposed) return;
        // Only the notification Stop action. Our own stopService() emits
        // userStop and must not tear down live sessions.
        if (reason !== "nativeNotificationStop" && reason !== "killed") return;
        if (killingRef.current) return;
        killingRef.current = true;
        try {
          await onKillSessionsRef.current();
          await stopKeepalive();
        } finally {
          killingRef.current = false;
        }
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
  }, [readiness.isAndroid]);

  useEffect(() => {
    enqueueKeepaliveSync();
  }, [
    checked,
    connectedCount,
    readiness.isAndroid,
    readiness.ready,
    enqueueKeepaliveSync,
  ]);

  const ensureReady = useCallback(async () => {
    const android = await isAndroidPlatform();
    if (!android) return true;

    const next = await refreshReadiness();
    if (next.ready) return true;
    setSetupOpen(true);
    return false;
  }, [refreshReadiness]);

  const enableBackground = useCallback(async () => {
    setSetupBusy(true);
    try {
      if (!readiness.notificationsGranted) {
        await requestNotifications();
      }
      const afterNotif = await getBackgroundReadiness();
      if (!afterNotif.batteryUnrestricted) {
        await requestBatteryUnrestricted();
      }
      const next = await refreshReadiness();
      return next.ready;
    } finally {
      setSetupBusy(false);
    }
  }, [readiness.notificationsGranted, refreshReadiness]);

  const openBatterySettings = useCallback(async () => {
    setSetupBusy(true);
    try {
      await openSystemBatterySettings();
    } finally {
      setSetupBusy(false);
    }
  }, []);

  return {
    isAndroid: readiness.isAndroid,
    readiness,
    setupOpen,
    setupBusy,
    checked,
    ensureReady,
    enableBackground,
    openBatterySettings,
    refreshReadiness,
  };
}
