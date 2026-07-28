import { useEffect } from "react";
import { cycleTabId } from "@/features/session-tabs/lib/cycle-tab";
import type { SessionTab } from "@/features/session-tabs/types";

type UseSessionTabShortcutsOptions = {
  enabled: boolean;
  tabs: SessionTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function useSessionTabShortcuts({
  enabled,
  tabs,
  activeId,
  onSelect,
}: UseSessionTabShortcutsOptions) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!enabled) return;
      if (event.key !== "Tab" || !event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const nextId = cycleTabId(tabs, activeId, event.shiftKey ? -1 : 1);
      if (!nextId) return;

      event.preventDefault();
      event.stopPropagation();
      onSelect(nextId);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeId, enabled, onSelect, tabs]);
}
