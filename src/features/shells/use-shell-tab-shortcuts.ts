import { useEffect } from "react";
import { cycleShellId } from "@/features/shells/lib/cycle-shell";
import type { ShellSession } from "@/features/shells/types";

type UseShellTabShortcutsOptions = {
  enabled: boolean;
  sessions: ShellSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function useShellTabShortcuts({
  enabled,
  sessions,
  activeId,
  onSelect,
}: UseShellTabShortcutsOptions) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!enabled) return;
      if (event.key !== "Tab" || !event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const nextId = cycleShellId(
        sessions,
        activeId,
        event.shiftKey ? -1 : 1,
      );
      if (!nextId) return;

      event.preventDefault();
      event.stopPropagation();
      onSelect(nextId);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeId, enabled, onSelect, sessions]);
}
