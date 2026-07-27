import { ChevronRight, Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status/status-dot";
import { cn } from "@/lib/utils";
import type { Host } from "@/features/hosts/types";

type HostRailProps = {
  hosts: Host[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddHost: () => void;
  className?: string;
};

export function HostRail({
  hosts,
  selectedId,
  onSelect,
  onAddHost,
  className,
}: HostRailProps) {
  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col bg-sidebar text-sidebar-foreground",
        "w-full md:w-60 md:shrink-0 md:border-r md:border-sidebar-border",
        className,
      )}
    >
      <div className="shrink-0 border-b border-sidebar-border pt-[env(safe-area-inset-top,0px)] md:pt-0">
        <div className="flex h-12 items-center gap-2 px-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Server className="size-3.5" aria-hidden />
          </div>
          <span className="text-sm font-semibold tracking-tight">Relix</span>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <h2 className="px-1 text-[11px] font-medium text-muted-foreground">
          Hosts
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onAddHost}
          aria-label="Add host"
          className="text-muted-foreground hover:text-foreground md:size-6 md:[&_svg:not([class*='size-'])]:size-3.5"
        >
          <Plus />
        </Button>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label="Saved hosts"
      >
        {hosts.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No hosts yet. Add one to connect.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {hosts.map((host) => {
              const selected = host.id === selectedId;
              return (
                <li key={host.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(host.id)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors duration-150 ease-out",
                      "min-h-11 py-2.5 text-sm md:min-h-0 md:py-2 md:text-[13px]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      selected
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <StatusDot status={host.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {host.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground md:hidden">
                        {host.user}@{host.hostname}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground/70 md:hidden"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
