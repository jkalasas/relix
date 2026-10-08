import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Folder, GitBranch, Network } from "lucide-react";
import { FileTreeSidebar, type FilesController } from "@/features/files";
import { ForwardsPanel, type PortForward } from "@/features/forwards";
import { GitPanel, type GitController } from "@/features/git";
import type { Host } from "@/features/hosts";
import type { SidePanelTab } from "@/app/hooks/use-workspace";
import type { FsEntry } from "@/features/ssh";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/hooks/use-sidebar-width";

function PanelResizeRail({
  widthPx,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
}: {
  widthPx: number;
  onWidthChange: (px: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (px: number) => void;
}) {
  const drag = useRef({
    active: false,
    startX: 0,
    startWidth: 0,
    lastWidth: widthPx,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = {
      active: true,
      startX: event.clientX,
      startWidth: widthPx,
      lastWidth: widthPx,
    };
    onResizeStart();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const delta = drag.current.startX - event.clientX;
    const next = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.round(drag.current.startWidth + delta)),
    );
    drag.current.lastWidth = next;
    onWidthChange(next);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onResizeEnd(drag.current.lastWidth);
  };

  return (
    <button
      type="button"
      aria-label="Resize side panel"
      title="Drag to resize"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      className="absolute inset-y-0 -left-2 z-20 hidden w-4 cursor-e-resize touch-none select-none after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex"
    />
  );
}

type WorkspaceSidePanelProps = {
  host: Host;
  show: boolean;
  collapsed: boolean;
  activeTab: SidePanelTab;
  widthPx: number;
  rootLabel: string;
  files: FilesController;
  git: GitController;
  forwards: PortForward[];
  selectedPath: string | null;
  showPorts: boolean;
  onWidthChange: (px: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (px: number) => void;
  onSelectTab: (tab: SidePanelTab) => void;
  onConnect: () => void;
  onOpenFile: (entry: FsEntry) => void;
  onAddForward: () => void;
  onStartForward: (id: string) => void;
  onStopForward: (id: string) => void;
  onEditForward: (id: string) => void;
  onDeleteForward: (id: string) => void;
};

const TABS: { id: SidePanelTab; label: string; icon: typeof Folder }[] = [
  { id: "files", label: "Files", icon: Folder },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "ports", label: "Ports", icon: Network },
];

/**
 * Right-side workspace panel: file manager, git, and ports in one
 * tabbed surface. Desktop only; mobile keeps full-screen tool pages.
 */
export function WorkspaceSidePanel({
  host,
  show,
  collapsed,
  activeTab,
  widthPx,
  rootLabel,
  files,
  git,
  forwards,
  selectedPath,
  showPorts,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  onSelectTab,
  onConnect,
  onOpenFile,
  onAddForward,
  onStartForward,
  onStopForward,
  onEditForward,
  onDeleteForward,
}: WorkspaceSidePanelProps) {
  if (!show || collapsed) return null;
  const visibleTabs = showPorts
    ? TABS
    : TABS.filter((tab) => tab.id !== "ports");
  const effectiveTab =
    activeTab === "ports" && !showPorts ? "files" : activeTab;

  return (
    <aside
      aria-label="Workspace side panel"
      style={{ width: widthPx }}
      className="relative hidden min-h-0 w-auto shrink-0 flex-col overflow-hidden border-l border-sidebar-border bg-sidebar md:flex"
    >
      <PanelResizeRail
        widthPx={widthPx}
        onWidthChange={onWidthChange}
        onResizeStart={onResizeStart}
        onResizeEnd={onResizeEnd}
      />
      <div
        role="tablist"
        aria-label="Side panel"
        className="flex h-10 shrink-0 items-center gap-0.5 border-b border-sidebar-border px-2"
      >
        {visibleTabs.map((tab) => {
          const selected = effectiveTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`sidepanel-${tab.id}`}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[12px] select-none",
                selected
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 opacity-70" aria-hidden />
              {tab.label}
            </button>
          );
        })}
        <span className="min-w-0 flex-1" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {effectiveTab === "files" ? (
          <div
            role="tabpanel"
            id="sidepanel-files"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <FileTreeSidebar
              files={files}
              rootLabel={rootLabel}
              selectedPath={selectedPath}
              onOpenFile={onOpenFile}
            />
          </div>
        ) : null}
        {effectiveTab === "git" ? (
          <div
            role="tabpanel"
            id="sidepanel-git"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <GitPanel host={host} git={git} onConnect={onConnect} />
          </div>
        ) : null}
        {effectiveTab === "ports" && showPorts ? (
          <div
            role="tabpanel"
            id="sidepanel-ports"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <ForwardsPanel
              host={host}
              forwards={forwards}
              onConnect={onConnect}
              onAddForward={onAddForward}
              onStartForward={onStartForward}
              onStopForward={onStopForward}
              onEditForward={onEditForward}
              onDeleteForward={onDeleteForward}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
