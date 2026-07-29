import { Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status/status-dot";
import { EmptyState } from "@/components/workspace/empty-state";
import { isLocalHost } from "@/features/hosts/local-host";
import type { Host } from "@/features/hosts/types";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type HostsPageProps = {
  hosts: Host[];
  onSelect: (id: string) => void;
  onAddHost: () => void;
  className?: string;
};

export function HostsPage({
  hosts,
  onSelect,
  onAddHost,
  className,
}: HostsPageProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-background text-foreground",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center gap-2 px-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Server className="size-3.5" aria-hidden />
          </div>
          <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
            Relix
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onAddHost}
            aria-label="Add host"
            className="size-9 text-muted-foreground hover:text-foreground"
          >
            <Plus />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4">
          <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
            <h1 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Hosts
            </h1>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddHost}
              className="h-8 gap-1 px-2 text-[12px] max-sm:hidden"
            >
              <Plus className="size-3.5" />
              Host
            </Button>
          </div>

          {hosts.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No hosts yet"
              description="Add a host to open projects, shells, and tunnels."
              className="rounded-lg border border-border bg-surface py-12"
              action={
                <Button type="button" size="sm" onClick={onAddHost}>
                  Add host
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-1.5" aria-label="Saved hosts">
              {hosts.map((host) => {
                const subtitle = isLocalHost(host)
                  ? "local shell"
                  : `${host.user}@${host.hostname}:${host.port}`;
                return (
                  <li key={host.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(host.id)}
                      className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <StatusDot status={host.status} className="size-2" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {host.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[12px] text-muted-foreground">
                          {subtitle}
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/70"
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
