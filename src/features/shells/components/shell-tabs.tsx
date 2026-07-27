import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  Code2,
  Plus,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  shellLaunchById,
  sessionDisplayTitle,
  type ShellLaunchId,
} from "@/features/shells/launch";
import type { ShellSession } from "@/features/shells/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const LAUNCH_ICONS: Record<
  ShellLaunchId,
  ComponentType<{ className?: string }>
> = {
  shell: TerminalSquare,
  claude: Sparkles,
  opencode: Code2,
  pi: Bot,
};

const LONG_PRESS_MS = 480;
const MOVE_THRESHOLD_PX = 10;

type ShellTabsProps = {
  sessions: ShellSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onNew: (launchId?: ShellLaunchId) => void;
};

type DesktopMenuState = {
  sessionId: string;
  x: number;
  y: number;
};

function LaunchItem({
  id,
  onSelect,
}: {
  id: ShellLaunchId;
  onSelect: (launchId: ShellLaunchId) => void;
}) {
  const launch = shellLaunchById(id);
  const Icon = LAUNCH_ICONS[id];
  return (
    <DropdownMenuItem onClick={() => onSelect(id)} className="gap-2 py-1.5">
      <Icon className="size-3.5 text-muted-foreground" />
      <span>{launch.label}</span>
    </DropdownMenuItem>
  );
}

function reorderIds(ids: string[], fromId: string, toIndex: number): string[] {
  const fromIndex = ids.indexOf(fromId);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length) return ids;
  if (fromIndex === toIndex) return ids;
  const next = [...ids];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function indexFromPoint(
  container: HTMLElement,
  clientX: number,
  orderedIds: string[],
): number {
  const nodes = [
    ...container.querySelectorAll<HTMLElement>("[data-shell-tab-id]"),
  ];
  if (nodes.length === 0) return 0;

  for (let i = 0; i < nodes.length; i += 1) {
    const rect = nodes[i].getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (clientX < mid) {
      const id = nodes[i].dataset.shellTabId;
      const index = id ? orderedIds.indexOf(id) : i;
      return index < 0 ? i : index;
    }
  }
  return orderedIds.length - 1;
}

export function ShellTabs({
  sessions,
  activeId,
  onSelect,
  onClose,
  onRename,
  onReorder,
  onNew,
}: ShellTabsProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const tabListRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const [orderedIds, setOrderedIds] = useState(() =>
    sessions.map((session) => session.id),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [desktopMenu, setDesktopMenu] = useState<DesktopMenuState | null>(null);
  const [drawerSessionId, setDrawerSessionId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pointerRef = useRef<{
    sessionId: string;
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;

  useEffect(() => {
    setOrderedIds(sessions.map((session) => session.id));
  }, [sessions]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!desktopMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDesktopMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-shell-tab-menu]")) return;
      setDesktopMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [desktopMenu]);

  const sessionById = useCallback((id: string) => {
    return sessionsRef.current.find((session) => session.id === id) ?? null;
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openActions = useCallback(
    (sessionId: string, point?: { x: number; y: number }) => {
      suppressClickRef.current = true;
      onSelect(sessionId);
      if (isDesktop && point) {
        setDrawerSessionId(null);
        setDesktopMenu({ sessionId, x: point.x, y: point.y });
        return;
      }
      setDesktopMenu(null);
      setDrawerSessionId(sessionId);
    },
    [isDesktop, onSelect],
  );

  const beginRename = useCallback(
    (sessionId: string) => {
      const session = sessionById(sessionId);
      if (!session) return;
      setDesktopMenu(null);
      setDrawerSessionId(null);
      setEditingId(sessionId);
      setEditValue(sessionDisplayTitle(session));
    },
    [sessionById],
  );

  const commitRename = useCallback(() => {
    if (!editingId) return;
    onRename(editingId, editValue);
    setEditingId(null);
    setEditValue("");
  }, [editValue, editingId, onRename]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  const endDrag = useCallback(
    (commit: boolean) => {
      const pointer = pointerRef.current;
      pointerRef.current = null;
      clearLongPress();
      if (!pointer?.dragging) {
        setDraggingId(null);
        return;
      }
      setDraggingId(null);
      suppressClickRef.current = true;
      if (commit) {
        onReorder(orderedIdsRef.current);
      }
    },
    [clearLongPress, onReorder],
  );

  const onTabPointerDown = useCallback(
    (sessionId: string, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (editingId === sessionId) return;

      clearLongPress();
      pointerRef.current = {
        sessionId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };

      longPressTimerRef.current = window.setTimeout(() => {
        const pointer = pointerRef.current;
        if (!pointer || pointer.sessionId !== sessionId || pointer.dragging) {
          return;
        }
        pointerRef.current = null;
        openActions(sessionId, { x: pointer.startX, y: pointer.startY });
      }, LONG_PRESS_MS);
    },
    [clearLongPress, editingId, openActions],
  );

  const onTabPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;

      const dx = event.clientX - pointer.startX;
      const dy = event.clientY - pointer.startY;
      const distance = Math.hypot(dx, dy);

      if (!pointer.dragging) {
        if (distance < MOVE_THRESHOLD_PX) return;
        clearLongPress();
        pointer.dragging = true;
        setDraggingId(pointer.sessionId);
        setDesktopMenu(null);
        setDrawerSessionId(null);
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      const container = tabListRef.current;
      if (!container) return;
      const toIndex = indexFromPoint(
        container,
        event.clientX,
        orderedIdsRef.current,
      );
      setOrderedIds((current) =>
        reorderIds(current, pointer.sessionId, toIndex),
      );
    },
    [clearLongPress],
  );

  const onTabPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      if (pointer.dragging) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // already released
        }
      }
      endDrag(true);
    },
    [endDrag],
  );

  const onTabPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      endDrag(false);
      setOrderedIds(sessionsRef.current.map((session) => session.id));
    },
    [endDrag],
  );

  const onTabClick = useCallback(
    (sessionId: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (editingId) return;
      onSelect(sessionId);
    },
    [editingId, onSelect],
  );

  const onTabContextMenu = useCallback(
    (sessionId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (editingId === sessionId) return;
      openActions(sessionId, { x: event.clientX, y: event.clientY });
    },
    [editingId, openActions],
  );

  const orderedSessions = orderedIds
    .map((id) => sessions.find((session) => session.id === id))
    .filter((session): session is ShellSession => Boolean(session));

  for (const session of sessions) {
    if (!orderedSessions.some((item) => item.id === session.id)) {
      orderedSessions.push(session);
    }
  }

  const actionsSession = drawerSessionId
    ? sessionById(drawerSessionId)
    : null;
  const actionsTitle = actionsSession
    ? sessionDisplayTitle(actionsSession)
    : "";

  return (
    <>
      <div
        ref={tabListRef}
        className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2"
      >
        {orderedSessions.map((session) => {
          const active = session.id === activeId;
          const label = sessionDisplayTitle(session);
          const dragging = draggingId === session.id;
          const editing = editingId === session.id;

          return (
            <div
              key={session.id}
              data-shell-tab-id={session.id}
              onPointerDown={(event) => onTabPointerDown(session.id, event)}
              onPointerMove={onTabPointerMove}
              onPointerUp={onTabPointerUp}
              onPointerCancel={onTabPointerCancel}
              onContextMenu={(event) => onTabContextMenu(session.id, event)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md px-2 font-mono text-[12px] select-none",
                active
                  ? "bg-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                dragging && "opacity-60",
                draggingId && "touch-none",
              )}
            >
              {editing ? (
                <input
                  autoFocus
                  value={editValue}
                  aria-label={`Rename ${label}`}
                  onChange={(event) => setEditValue(event.target.value)}
                  onBlur={commitRename}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="max-w-[9rem] min-w-[4rem] rounded-sm bg-background px-1 py-0.5 text-[12px] text-foreground outline-none ring-1 ring-ring"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onTabClick(session.id)}
                  className="max-w-[9rem] truncate"
                >
                  {label}
                </button>
              )}
            </div>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="New session"
                className="size-7"
              />
            }
          >
            <Plus className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="min-w-44 w-auto"
          >
            <LaunchItem id="shell" onSelect={onNew} />
            <DropdownMenuSeparator />
            <LaunchItem id="claude" onSelect={onNew} />
            <LaunchItem id="opencode" onSelect={onNew} />
            <LaunchItem id="pi" onSelect={onNew} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isDesktop && desktopMenu
        ? createPortal(
            <div
              data-shell-tab-menu=""
              role="menu"
              className="fixed z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{
                left: Math.min(desktopMenu.x, window.innerWidth - 160),
                top: Math.min(desktopMenu.y, window.innerHeight - 96),
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => beginRename(desktopMenu.sessionId)}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-left text-sm text-destructive outline-hidden select-none hover:bg-destructive/10"
                onClick={() => {
                  onClose(desktopMenu.sessionId);
                  setDesktopMenu(null);
                }}
              >
                Close
              </button>
            </div>,
            document.body,
          )
        : null}

      <Drawer
        open={drawerSessionId != null}
        onOpenChange={(open) => {
          if (!open) setDrawerSessionId(null);
        }}
        swipeDirection="down"
        showSwipeHandle
      >
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-mono text-sm">
              {actionsTitle || "Session"}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerFooter className="gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 w-full"
              onClick={() => {
                if (drawerSessionId) beginRename(drawerSessionId);
              }}
            >
              Rename
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="min-h-11 w-full"
              onClick={() => {
                if (drawerSessionId) onClose(drawerSessionId);
                setDrawerSessionId(null);
              }}
            >
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
