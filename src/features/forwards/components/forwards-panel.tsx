import { ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForwardRow } from "@/features/forwards/components/forward-row";
import type { PortForward } from "@/features/forwards/types";
import type { Host } from "@/features/hosts/types";

type ForwardsPanelProps = {
  host: Host;
  forwards: PortForward[];
  onConnect: () => void;
  onAddForward: () => void;
  onStartForward: (id: string) => void;
  onStopForward: (id: string) => void;
  onEditForward: (id: string) => void;
  onDeleteForward: (id: string) => void;
};

export function ForwardsPanel({
  host,
  forwards,
  onConnect,
  onAddForward,
  onStartForward,
  onStopForward,
  onEditForward,
  onDeleteForward,
}: ForwardsPanelProps) {
  const connected = host.status === "connected";

  return (
    <div
      role="tabpanel"
      id="panel-forwards"
      aria-labelledby="tab-forwards"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-4 md:h-10 md:min-h-0">
        <p className="text-xs text-muted-foreground">
          {forwards.length === 0
            ? "No tunnels on this host"
            : `${forwards.length} tunnel${forwards.length === 1 ? "" : "s"}`}
          {!connected && forwards.length > 0 ? " · connect to start" : null}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={onAddForward}
          className="min-h-9 md:min-h-7"
        >
          <Plus data-icon="inline-start" />
          New tunnel
        </Button>
      </div>

      {forwards.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 pb-[env(safe-area-inset-bottom)] text-center">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-status-tunnel">
            <ArrowLeftRight className="size-5" aria-hidden />
          </div>
          <div className="max-w-sm space-y-1.5">
            <h3 className="text-sm font-medium text-balance">
              No port forwards yet
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
              Map ports through this host — local, remote reverse, or SOCKS.
              {!connected
                ? " Connect the host when you are ready to start a tunnel."
                : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onAddForward}
              className="min-h-10 px-4 md:min-h-7"
            >
              <Plus data-icon="inline-start" />
              New tunnel
            </Button>
            {!connected ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onConnect}
                className="min-h-10 px-4 md:min-h-7"
              >
                Connect
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ul className="flex flex-col gap-1.5" aria-label="Port forwards">
            {forwards.map((forward) => (
              <ForwardRow
                key={forward.id}
                forward={forward}
                connected={connected}
                onStart={() => onStartForward(forward.id)}
                onStop={() => onStopForward(forward.id)}
                onEdit={() => onEditForward(forward.id)}
                onDelete={() => onDeleteForward(forward.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
