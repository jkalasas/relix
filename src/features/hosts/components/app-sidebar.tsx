import type { ReactNode } from "react";
import { Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarResizeRail } from "@/features/hosts/components/sidebar-resize-rail";
import { HostList } from "@/features/hosts/components/host-list";
import type { Host } from "@/features/hosts/types";

type SidebarResizeProps = {
  widthPx: number;
  onWidthChange: (px: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (px: number) => void;
};

type AppSidebarHostsProps = SidebarResizeProps & {
  mode: "hosts";
  hosts: Host[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddHost: () => void;
};

type AppSidebarFilesProps = SidebarResizeProps & {
  mode: "files";
  onShowHosts: () => void;
  children: ReactNode;
};

type AppSidebarProps = AppSidebarHostsProps | AppSidebarFilesProps;

export function AppSidebar(props: AppSidebarProps) {
  return (
    <Sidebar
      collapsible="icon"
      className="!top-[var(--titlebar-height,0px)] !bottom-0 !h-auto"
    >
      <SidebarHeader className="gap-0 border-b border-sidebar-border p-0">
        <div className="flex h-10 items-center gap-2 px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Server className="size-3.5" aria-hidden />
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Relix
          </span>
          {props.mode === "files" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={props.onShowHosts}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden"
            >
              Hosts
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={props.onAddHost}
              aria-label="Add host"
              className="size-7 text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden"
            >
              <Plus className="size-3.5" />
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {props.mode === "hosts" ? (
          <HostList
            hosts={props.hosts}
            selectedId={props.selectedId}
            onSelect={props.onSelect}
          />
        ) : (
          props.children
        )}
      </SidebarContent>

      <SidebarResizeRail
        widthPx={props.widthPx}
        onWidthChange={props.onWidthChange}
        onResizeStart={props.onResizeStart}
        onResizeEnd={props.onResizeEnd}
      />
    </Sidebar>
  );
}
