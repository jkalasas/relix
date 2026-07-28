import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { WindowControls } from "@/components/workspace/window-controls";
import { cn } from "@/lib/utils";

type DesktopTitleBarProps = {
  children?: ReactNode;
  trailing?: ReactNode;
  showSidebarTrigger?: boolean;
  className?: string;
};

function onDragRegionDoubleClick() {
  if (!isTauri()) return;
  void getCurrentWindow()
    .toggleMaximize()
    .catch(() => undefined);
}

export function DesktopTitleBar({
  children,
  trailing,
  showSidebarTrigger = true,
  className,
}: DesktopTitleBarProps) {
  return (
    <header
      className={cn(
        "relative z-20 flex h-[var(--titlebar-height)] shrink-0 items-center border-b border-border bg-sidebar text-sidebar-foreground select-none",
        className,
      )}
    >
      {showSidebarTrigger ? (
        <div className="flex h-full shrink-0 items-center gap-1 px-2">
          <SidebarTrigger className="size-7 text-muted-foreground hover:text-foreground" />
        </div>
      ) : (
        <div
          data-tauri-drag-region
          onDoubleClick={onDragRegionDoubleClick}
          className="h-full w-3 shrink-0"
        />
      )}

      <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
        {children ? (
          <div className="flex h-full min-w-0 max-w-full items-center overflow-hidden">
            {children}
          </div>
        ) : null}
        <div
          data-tauri-drag-region
          onDoubleClick={onDragRegionDoubleClick}
          className="h-full min-w-4 flex-1"
        />
      </div>

      {trailing ? (
        <div className="flex h-full min-w-0 shrink-0 items-center overflow-hidden">
          {trailing}
        </div>
      ) : null}

      <WindowControls className="relative z-30 shrink-0" />
    </header>
  );
}
