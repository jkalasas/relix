import { ChevronRight } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { StatusDot } from "@/components/status/status-dot";
import { isLocalHost } from "@/features/hosts/local-host";
import type { Host } from "@/features/hosts/types";
import { cn } from "@/lib/utils";

type HostListProps = {
  hosts: Host[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  mobile?: boolean;
};

export function HostList({
  hosts,
  selectedId,
  onSelect,
  mobile = false,
}: HostListProps) {
  return (
    <SidebarGroup className={cn(mobile && "p-2 pt-1")}>
      <SidebarGroupLabel className={cn(mobile && "h-9 px-2.5 text-[11px]")}>
        Hosts
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {hosts.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No hosts yet. Add one to connect.
          </p>
        ) : (
          <SidebarMenu
            className={cn(mobile && "gap-0.5")}
            aria-label="Saved hosts"
          >
            {hosts.map((host) => {
              const selected = host.id === selectedId;
              const subtitle = isLocalHost(host)
                ? "local shell"
                : `${host.user}@${host.hostname}`;

              return (
                <SidebarMenuItem key={host.id}>
                  <SidebarMenuButton
                    type="button"
                    isActive={selected}
                    tooltip={host.name}
                    onClick={() => onSelect(host.id)}
                    className={cn(
                      mobile &&
                        "h-auto min-h-11 rounded-lg px-2.5 py-2.5 text-sm",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <StatusDot
                        status={host.status}
                        className="size-2"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {host.name}
                      </span>
                      {mobile ? (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {subtitle}
                        </span>
                      ) : null}
                    </span>
                    {mobile ? (
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/70"
                        aria-hidden
                      />
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
