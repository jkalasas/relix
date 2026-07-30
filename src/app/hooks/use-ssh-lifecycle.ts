import { useEffect } from "react";
import {
  listenSshConnectionClosed,
  listenSshForwardClosed,
  listenSshForwardError,
  listenSshShellClosed,
} from "@/features/ssh";

type UseSshLifecycleOptions = {
  setHostStatus: (
    id: string,
    status: "connected" | "idle" | "error",
    lastError?: string,
  ) => void;
  markHostForwardsIdle: (hostId: string) => void;
  markForwardClosed: (hostId: string, forwardId: string) => void;
  markForwardError: (hostId: string, forwardId: string, message: string) => void;
  handleChannelClosed: (hostId: string, channelId: string) => void;
  clearSessionsForHost: (hostId: string) => void;
  clearTabsForHost?: (hostId: string) => void;
};

export function useSshLifecycle({
  setHostStatus,
  markHostForwardsIdle,
  markForwardClosed,
  markForwardError,
  handleChannelClosed,
  clearSessionsForHost,
  clearTabsForHost,
}: UseSshLifecycleOptions) {
  useEffect(() => {
    let disposed = false;
    const unsubs: Array<() => void> = [];

    void (async () => {
      const shellClosed = await listenSshShellClosed((event) => {
        handleChannelClosed(event.hostId, event.sessionId);
      });
      if (disposed) {
        shellClosed();
        return;
      }
      unsubs.push(shellClosed);

      const connectionClosed = await listenSshConnectionClosed((event) => {
        setHostStatus(event.hostId, "error", "SSH connection closed");
        clearSessionsForHost(event.hostId);
        clearTabsForHost?.(event.hostId);
        markHostForwardsIdle(event.hostId);
      });
      if (disposed) {
        connectionClosed();
        return;
      }
      unsubs.push(connectionClosed);

      const forwardClosed = await listenSshForwardClosed((event) => {
        markForwardClosed(event.hostId, event.forwardId);
      });
      if (disposed) {
        forwardClosed();
        return;
      }
      unsubs.push(forwardClosed);

      const forwardError = await listenSshForwardError((event) => {
        markForwardError(event.hostId, event.forwardId, event.message);
      });
      if (disposed) {
        forwardError();
        return;
      }
      unsubs.push(forwardError);
    })();

    return () => {
      disposed = true;
      for (const fn of unsubs) fn();
    };
  }, [
    clearSessionsForHost,
    clearTabsForHost,
    handleChannelClosed,
    markForwardClosed,
    markForwardError,
    markHostForwardsIdle,
    setHostStatus,
  ]);
}
