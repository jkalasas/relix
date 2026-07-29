import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "@/components/status/status-dot";
import type { Host } from "@/features/hosts/types";
import {
  scopeLabel,
  toWorkspaceId,
  type WorkspaceRef,
} from "@/features/projects";
import type { ProjectConfig } from "@/features/projects/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type WorkspaceRecentsProps = {
  recents: WorkspaceRef[];
  hosts: Host[];
  projectsByHost: Record<string, ProjectConfig[]>;
  activeWorkspaceId: string | null;
  onSelect: (ref: WorkspaceRef) => void;
  onReorder: (orderedIds: string[]) => void;
  className?: string;
};

type RecentItem = {
  ref: WorkspaceRef;
  host: Host;
  id: string;
  label: string;
  path?: string;
  active: boolean;
};

function buildItems(
  recents: WorkspaceRef[],
  hosts: Host[],
  projectsByHost: Record<string, ProjectConfig[]>,
  activeWorkspaceId: string | null,
): RecentItem[] {
  return recents.flatMap((ref) => {
    const host = hosts.find((item) => item.id === ref.hostId);
    if (!host) return [];
    const id = toWorkspaceId(ref);
    const projectId =
      ref.scope.kind === "project" ? ref.scope.projectId : null;
    const project = projectId
      ? (projectsByHost[ref.hostId] ?? []).find((item) => item.id === projectId)
      : null;
    return [
      {
        ref,
        host,
        id,
        label: scopeLabel(ref.scope, project?.name),
        path: project?.path,
        active: activeWorkspaceId === id,
      },
    ];
  });
}

function selectRef(item: RecentItem): WorkspaceRef {
  return {
    hostId: item.ref.hostId,
    scope:
      item.ref.scope.kind === "project"
        ? { kind: "project", projectId: item.ref.scope.projectId }
        : { kind: "adhoc" },
  };
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
  clientY: number,
  orderedIds: string[],
): number {
  const nodes = [
    ...container.querySelectorAll<HTMLElement>("[data-workspace-recent-id]"),
  ];
  if (nodes.length === 0) return 0;

  for (let i = 0; i < nodes.length; i += 1) {
    const rect = nodes[i].getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (clientY < mid) {
      const id = nodes[i].dataset.workspaceRecentId;
      const index = id ? orderedIds.indexOf(id) : i;
      return index < 0 ? i : index;
    }
  }
  return orderedIds.length - 1;
}

function WorkspaceList({
  items,
  onSelect,
  onReorder,
  onPick,
  className,
}: {
  items: RecentItem[];
  onSelect: (item: RecentItem) => void;
  onReorder: (orderedIds: string[]) => void;
  onPick?: () => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [orderedIds, setOrderedIds] = useState(() =>
    items.map((item) => item.id),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;

  useEffect(() => {
    setOrderedIds(items.map((item) => item.id));
  }, [items]);

  const byId = new Map(items.map((item) => [item.id, item]));
  const orderedItems = orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is RecentItem => Boolean(item));

  const onGripPointerDown = useCallback(
    (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        startY: event.clientY,
        moved: false,
      };
    },
    [],
  );

  const onGripPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return;
      drag.moved = true;
      setDraggingId(drag.id);
      const container = listRef.current;
      if (!container) return;
      const toIndex = indexFromPoint(
        container,
        event.clientY,
        orderedIdsRef.current,
      );
      setOrderedIds((current) => reorderIds(current, drag.id, toIndex));
    },
    [],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      if (drag.moved) {
        onReorder(orderedIdsRef.current);
      }
      dragRef.current = null;
      setDraggingId(null);
    },
    [onReorder],
  );

  return (
    <div ref={listRef} className={cn("flex flex-col gap-0.5", className)}>
      {orderedItems.map((item) => (
        <div
          key={item.id}
          data-workspace-recent-id={item.id}
          className={cn(
            "flex min-h-11 items-stretch gap-0.5 rounded-lg",
            item.active && "bg-elevated",
            draggingId === item.id && "opacity-60",
          )}
        >
          <button
            type="button"
            aria-label={`Reorder ${item.host.name}`}
            className="flex shrink-0 cursor-grab items-center px-1.5 text-muted-foreground touch-none active:cursor-grabbing"
            onPointerDown={(event) => onGripPointerDown(item.id, event)}
            onPointerMove={onGripPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripVertical className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              onSelect(item);
              onPick?.();
            }}
            className="flex min-h-11 min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 md:py-1.5"
          >
            <StatusDot status={item.host.status} className="mt-1.5 size-1.5" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {item.host.name}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[12px] text-muted-foreground">
                {item.label}
                {item.path ? ` · ${item.path}` : ""}
              </span>
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

export function WorkspaceRecents({
  recents,
  hosts,
  projectsByHost,
  activeWorkspaceId,
  onSelect,
  onReorder,
  className,
}: WorkspaceRecentsProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (recents.length === 0) return null;

  const items = buildItems(recents, hosts, projectsByHost, activeWorkspaceId);
  if (items.length === 0) return null;

  const triggerClass = cn(
    "h-7 gap-1.5 px-2 text-[12px] text-muted-foreground hover:text-foreground",
    "md:h-7 max-md:size-9 max-md:px-0",
    className,
  );

  if (isDesktop) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Open workspaces"
              className={triggerClass}
            />
          }
        >
          <History className="size-3.5" />
          <span className="max-sm:hidden">Workspaces</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-72 w-auto p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Open workspaces</DropdownMenuLabel>
            <div
              className="pt-0.5"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <WorkspaceList
                items={items}
                onSelect={(item) => onSelect(selectRef(item))}
                onReorder={onReorder}
              />
            </div>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Open workspaces"
        className={triggerClass}
        onClick={() => setDrawerOpen(true)}
      >
        <History className="size-3.5" />
      </Button>
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        swipeDirection="down"
        showSwipeHandle
      >
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Open workspaces</DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[min(60dvh,24rem)] overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <WorkspaceList
              items={items}
              onSelect={(item) => onSelect(selectRef(item))}
              onReorder={onReorder}
              onPick={() => setDrawerOpen(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
