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
  FileText,
  Folder,
  Network,
  Plus,
  Sparkles,
  TerminalSquare,
  X,
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
  type ShellSession,
} from "@/features/shells";
import type { OpenFileState, SessionTab } from "@/features/session-tabs";
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

type SessionTabBarProps = {
  tabs: SessionTab[];
  activeId: string | null;
  shells: ShellSession[];
  files: Record<string, OpenFileState>;
  showPorts: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRenameShell: (shellId: string, name: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onNewShell: (launchId?: ShellLaunchId) => void;
  onOpenFiles: () => void;
  onOpenPorts: () => void;
  variant?: "default" | "titlebar";
};

type DesktopMenuState = {
  tabId: string;
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
    ...container.querySelectorAll<HTMLElement>("[data-session-tab-id]"),
  ];
  if (nodes.length === 0) return 0;

  for (let i = 0; i < nodes.length; i += 1) {
    const rect = nodes[i].getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (clientX < mid) {
      const id = nodes[i].dataset.sessionTabId;
      const index = id ? orderedIds.indexOf(id) : i;
      return index < 0 ? i : index;
    }
  }
  return orderedIds.length - 1;
}

function tabIcon(tab: SessionTab): ComponentType<{ className?: string }> {
  switch (tab.kind) {
    case "shell":
      return TerminalSquare;
    case "file":
      return FileText;
    case "files":
      return Folder;
    case "ports":
      return Network;
  }
}

function tabLabel(
  tab: SessionTab,
  shells: ShellSession[],
  files: Record<string, OpenFileState>,
): string {
  switch (tab.kind) {
    case "shell": {
      const session = shells.find((item) => item.id === tab.shellId);
      return session ? sessionDisplayTitle(session) : "shell";
    }
    case "file": {
      const file = files[tab.path];
      return file?.name ?? tab.name;
    }
    case "files":
      return "Files";
    case "ports":
      return "Ports";
  }
}

function tabDirty(tab: SessionTab, files: Record<string, OpenFileState>): boolean {
  if (tab.kind !== "file") return false;
  const file = files[tab.path];
  return file?.status === "ready" && file.dirty;
}

export function SessionTabBar({
  tabs,
  activeId,
  shells,
  files,
  showPorts,
  onSelect,
  onClose,
  onRenameShell,
  onReorder,
  onNewShell,
  onOpenFiles,
  onOpenPorts,
  variant = "default",
}: SessionTabBarProps) {
  const titlebar = variant === "titlebar";
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const shellsRef = useRef(shells);
  shellsRef.current = shells;

  const [orderedIds, setOrderedIds] = useState(() => tabs.map((tab) => tab.id));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [desktopMenu, setDesktopMenu] = useState<DesktopMenuState | null>(null);
  const [drawerTabId, setDrawerTabId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pointerRef = useRef<{
    tabId: string;
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
    setOrderedIds(tabs.map((tab) => tab.id));
  }, [tabs]);

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
      if (target?.closest("[data-session-tab-menu]")) return;
      setDesktopMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [desktopMenu]);

  const tabById = useCallback((id: string) => {
    return tabsRef.current.find((tab) => tab.id === id) ?? null;
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openActions = useCallback(
    (tabId: string, point?: { x: number; y: number }) => {
      suppressClickRef.current = true;
      onSelect(tabId);
      if (isDesktop && point) {
        setDrawerTabId(null);
        setDesktopMenu({ tabId, x: point.x, y: point.y });
        return;
      }
      setDesktopMenu(null);
      setDrawerTabId(tabId);
    },
    [isDesktop, onSelect],
  );

  const beginRename = useCallback(
    (tabId: string) => {
      const tab = tabById(tabId);
      if (!tab || tab.kind !== "shell") return;
      const session = shellsRef.current.find((item) => item.id === tab.shellId);
      if (!session) return;
      setDesktopMenu(null);
      setDrawerTabId(null);
      setEditingId(tabId);
      setEditValue(sessionDisplayTitle(session));
    },
    [tabById],
  );

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const tab = tabById(editingId);
    if (tab?.kind === "shell") {
      onRenameShell(tab.shellId, editValue);
    }
    setEditingId(null);
    setEditValue("");
  }, [editValue, editingId, onRenameShell, tabById]);

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
    (tabId: string, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (editingId === tabId) return;

      clearLongPress();
      pointerRef.current = {
        tabId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };

      longPressTimerRef.current = window.setTimeout(() => {
        const pointer = pointerRef.current;
        if (!pointer || pointer.tabId !== tabId || pointer.dragging) {
          return;
        }
        pointerRef.current = null;
        openActions(tabId, { x: pointer.startX, y: pointer.startY });
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
        setDraggingId(pointer.tabId);
        setDesktopMenu(null);
        setDrawerTabId(null);
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      const container = tabListRef.current;
      if (!container) return;
      const toIndex = indexFromPoint(
        container,
        event.clientX,
        orderedIdsRef.current,
      );
      setOrderedIds((current) => reorderIds(current, pointer.tabId, toIndex));
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
      setOrderedIds(tabsRef.current.map((tab) => tab.id));
    },
    [endDrag],
  );

  const onTabClick = useCallback(
    (tabId: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (editingId) return;
      onSelect(tabId);
    },
    [editingId, onSelect],
  );

  const onTabContextMenu = useCallback(
    (tabId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (editingId === tabId) return;
      openActions(tabId, { x: event.clientX, y: event.clientY });
    },
    [editingId, openActions],
  );

  const orderedTabs = orderedIds
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is SessionTab => Boolean(tab));

  for (const tab of tabs) {
    if (!orderedTabs.some((item) => item.id === tab.id)) {
      orderedTabs.push(tab);
    }
  }

  const actionsTab = drawerTabId ? tabById(drawerTabId) : null;
  const actionsTitle = actionsTab
    ? tabLabel(actionsTab, shells, files)
    : "";
  const actionsIsShell = actionsTab?.kind === "shell";

  return (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center gap-1",
          titlebar
            ? "h-full min-h-0 bg-transparent px-0"
            : "min-h-11 border-b border-border bg-background px-1.5 md:min-h-9 md:px-2",
        )}
      >
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Session tabs"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:gap-1"
        >
          {orderedTabs.map((tab) => {
            const active = tab.id === activeId;
            const label = tabLabel(tab, shells, files);
            const dirty = tabDirty(tab, files);
            const dragging = draggingId === tab.id;
            const editing = editingId === tab.id;
            const Icon = tabIcon(tab);

            return (
              <div
                key={tab.id}
                data-session-tab-id={tab.id}
                role="tab"
                id={`session-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`session-panel-${tab.kind === "shell" ? tab.shellId : tab.id}`}
                tabIndex={active ? 0 : -1}
                onPointerDown={(event) => onTabPointerDown(tab.id, event)}
                onPointerMove={onTabPointerMove}
                onPointerUp={onTabPointerUp}
                onPointerCancel={onTabPointerCancel}
                onContextMenu={(event) => onTabContextMenu(tab.id, event)}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 font-mono text-[12px] select-none",
                  titlebar
                    ? "h-7 rounded-md px-2"
                    : "h-9 rounded-lg px-2.5 md:h-7 md:rounded-md md:px-2",
                  active
                    ? "bg-elevated text-foreground ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  dragging && "opacity-60",
                  draggingId && "touch-none",
                )}
              >
                <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
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
                    onClick={() => onTabClick(tab.id)}
                    className="flex max-w-[9rem] items-center gap-1 truncate"
                    title={label}
                  >
                    <span className="truncate">{label}</span>
                    {dirty ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                        aria-label="Unsaved changes"
                      />
                    ) : null}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground md:size-5",
                    "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                    "md:pointer-events-none md:group-hover:pointer-events-auto md:group-focus-within:pointer-events-auto",
                  )}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 pl-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New shell"
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    titlebar ? "size-7" : "size-9 md:size-7",
                  )}
                />
              }
            >
              <Plus className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="min-w-44 w-auto"
            >
              <LaunchItem id="shell" onSelect={onNewShell} />
              <DropdownMenuSeparator />
              <LaunchItem id="claude" onSelect={onNewShell} />
              <LaunchItem id="opencode" onSelect={onNewShell} />
              <LaunchItem id="pi" onSelect={onNewShell} />
            </DropdownMenuContent>
          </DropdownMenu>
          {!isDesktop ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Files"
              className="size-9 text-muted-foreground hover:text-foreground"
              onClick={onOpenFiles}
            >
              <Folder className="size-3.5" />
            </Button>
          ) : null}
          {showPorts ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ports"
              className={cn(
                "text-muted-foreground hover:text-foreground",
                titlebar ? "size-7" : "size-9 md:size-7",
              )}
              onClick={onOpenPorts}
            >
              <Network className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {isDesktop && desktopMenu
        ? createPortal(
            <div
              data-session-tab-menu=""
              role="menu"
              className="fixed z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{
                left: Math.min(desktopMenu.x, window.innerWidth - 160),
                top: Math.min(desktopMenu.y, window.innerHeight - 96),
              }}
            >
              {tabById(desktopMenu.tabId)?.kind === "shell" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => beginRename(desktopMenu.tabId)}
                >
                  Rename
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-left text-sm text-destructive outline-hidden select-none hover:bg-destructive/10"
                onClick={() => {
                  onClose(desktopMenu.tabId);
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
        open={drawerTabId != null}
        onOpenChange={(open) => {
          if (!open) setDrawerTabId(null);
        }}
        swipeDirection="down"
        showSwipeHandle
      >
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-mono text-sm">
              {actionsTitle || "Tab"}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerFooter className="gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {actionsIsShell ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 w-full"
                onClick={() => {
                  if (drawerTabId) beginRename(drawerTabId);
                }}
              >
                Rename
              </Button>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="min-h-11 w-full"
              onClick={() => {
                if (drawerTabId) onClose(drawerTabId);
                setDrawerTabId(null);
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
