import { Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HostList } from "@/features/hosts/components/host-list";
import type { Host } from "@/features/hosts/types";
import { cn } from "@/lib/utils";

type MobileHostPaneProps = {
  hosts: Host[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddHost: () => void;
  className?: string;
};

export function MobileHostPane({
  hosts,
  selectedId,
  onSelect,
  onAddHost,
  className,
}: MobileHostPaneProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="shrink-0 border-b border-sidebar-border pt-[env(safe-area-inset-top)]">
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <HostList
          hosts={hosts}
          selectedId={selectedId}
          onSelect={onSelect}
          mobile
        />
      </div>
    </div>
  );
}
