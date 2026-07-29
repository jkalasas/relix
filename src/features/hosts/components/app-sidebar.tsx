import type { ReactNode } from "react";
import { FolderTree, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarResizeRail } from "@/features/hosts/components/sidebar-resize-rail";

type AppSidebarProps = {
  widthPx: number;
  onWidthChange: (px: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (px: number) => void;
  rootLabel: string;
  onShowHosts?: () => void;
  children: ReactNode;
};

export function AppSidebar({
  widthPx,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  rootLabel,
  onShowHosts,
  children,
}: AppSidebarProps) {
  return (
    <Sidebar
      collapsible="icon"
      className="!top-[var(--titlebar-height,0px)] !bottom-0 !h-auto"
    >
      <SidebarHeader className="gap-0 border-b border-sidebar-border p-0">
        <div className="flex h-10 items-center gap-2 px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <FolderTree className="size-3.5" aria-hidden />
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            {rootLabel}
          </span>
          {onShowHosts ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onShowHosts}
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden"
            >
              <Server className="size-3" />
              Hosts
            </Button>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {children}
      </SidebarContent>

      <SidebarResizeRail
        widthPx={widthPx}
        onWidthChange={onWidthChange}
        onResizeStart={onResizeStart}
        onResizeEnd={onResizeEnd}
      />
    </Sidebar>
  );
}
