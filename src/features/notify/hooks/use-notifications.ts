import { useCallback, useState } from "react";
import type { NotificationEntry, NotifyPayload } from "@/features/notify/types";

/**
 * In-memory notification tracker. One entry per tab — a new payload for a
 * tab replaces the old one. Nothing is persisted, so startup is always empty.
 */
export function useNotifications() {
  const [entries, setEntries] = useState<NotificationEntry[]>([]);

  const upsert = useCallback(
    (
      payload: NotifyPayload,
      hostId: string,
      workspaceId: string | null,
    ) => {
      const entry: NotificationEntry = {
        id: payload.id,
        tabId: payload.tabId,
        title: payload.title?.trim() || "Host notification",
        body: payload.body?.trim() || "",
        hostId,
        workspaceId,
        receivedAt: Date.now(),
      };
      setEntries((current) => [
        entry,
        ...current.filter((item) => item.tabId !== payload.tabId),
      ]);
    },
    [],
  );

  const resolve = useCallback((tabId: string) => {
    setEntries((current) => current.filter((item) => item.tabId !== tabId));
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
  }, []);

  const pruneClosedTabs = useCallback(
    (tabsByWorkspace: Record<string, Array<{ id: string }>>) => {
      setEntries((current) => {
        let changed = false;
        const next = current.filter((item) => {
          if (!item.workspaceId) return true;
          const tabs = tabsByWorkspace[item.workspaceId];
          const open = tabs?.some((tab) => tab.id === item.tabId) ?? false;
          if (!open) changed = true;
          return open;
        });
        return changed ? next : current;
      });
    },
    [],
  );

  const removeForHost = useCallback((hostId: string) => {
    setEntries((current) => current.filter((item) => item.hostId !== hostId));
  }, []);

  return {
    entries,
    count: entries.length,
    upsert,
    /** Alias for upsert's counterpart — dismissing is resolving. */
    dismiss: resolve,
    resolve,
    clearAll,
    pruneClosedTabs,
    removeForHost,
  };
}

export type UseNotifications = ReturnType<typeof useNotifications>;
