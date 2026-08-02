import { useEffect, useRef } from "react";
import { cycleTabId } from "@/features/session-tabs/lib/cycle-tab";
import {
  isCloseTabShortcut,
  isNewShellShortcut,
} from "@/lib/shortcut-chords";
import type { SessionTab } from "@/features/session-tabs/types";

type UseSessionTabShortcutsOptions = {
  enabled: boolean;
  tabs: SessionTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewShell?: () => void;
  onCloseActive?: () => void;
};

export function useSessionTabShortcuts({
  enabled,
  tabs,
  activeId,
  onSelect,
  onNewShell,
  onCloseActive,
}: UseSessionTabShortcutsOptions) {
  const enabledRef = useRef(enabled);
  const tabsRef = useRef(tabs);
  const activeIdRef = useRef(activeId);
  const onSelectRef = useRef(onSelect);
  const onNewShellRef = useRef(onNewShell);
  const onCloseActiveRef = useRef(onCloseActive);

  enabledRef.current = enabled;
  tabsRef.current = tabs;
  activeIdRef.current = activeId;
  onSelectRef.current = onSelect;
  onNewShellRef.current = onNewShell;
  onCloseActiveRef.current = onCloseActive;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!enabledRef.current || event.defaultPrevented || event.repeat) return;

      if (event.key === "Tab" && event.ctrlKey && !event.altKey && !event.metaKey) {
        const nextId = cycleTabId(
          tabsRef.current,
          activeIdRef.current,
          event.shiftKey ? -1 : 1,
        );
        if (!nextId) return;
        event.preventDefault();
        event.stopPropagation();
        onSelectRef.current(nextId);
        return;
      }

      // App chords (meta / ctrl+shift) — handle even when focus is xterm's
      // helper textarea or a contenteditable editor. They do not insert text.
      if (isNewShellShortcut(event)) {
        const handler = onNewShellRef.current;
        if (!handler) return;
        event.preventDefault();
        event.stopPropagation();
        handler();
        return;
      }

      if (isCloseTabShortcut(event)) {
        const handler = onCloseActiveRef.current;
        if (!handler) return;
        event.preventDefault();
        event.stopPropagation();
        handler();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
