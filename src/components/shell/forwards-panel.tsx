import { ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Host, PortForward } from "@/lib/types";

type ForwardsPanelProps = {
  host: Host;
  forwards: PortForward[];
  onConnect: () => void;
  onAddForward: () => void;
};

export function ForwardsPanel({
  host,
  forwards,
  onConnect,
  onAddForward,
}: ForwardsPanelProps) {
  if (host.status !== "connected") {
    return (
      <div
        role="tabpanel"
        id="panel-forwards"
        aria-labelledby="tab-forwards"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
          <ArrowLeftRight className="size-5" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h3 className="text-sm font-medium text-balance">
            Forwards need a live session
          </h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            Connect to {host.name} to open local, remote, or dynamic tunnels.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onConnect}
          className="min-h-10 px-4 md:min-h-7"
        >
          Connect
        </Button>
      </div>
    );
  }

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
            ? "No tunnels on this session"
            : `${forwards.length} tunnel${forwards.length === 1 ? "" : "s"}`}
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
              Map a local port to a remote service, or open a SOCKS dynamic
              tunnel through this host.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onAddForward}
            className="min-h-10 px-4 md:min-h-7"
          >
            <Plus data-icon="inline-start" />
            New tunnel
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ul className="flex flex-col gap-1.5" aria-label="Port forwards">
            {forwards.map((forward) => (
              <li
                key={forward.id}
                className="rounded-lg border border-border bg-surface px-3 py-3 font-mono text-xs md:grid md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-3 md:py-2.5"
              >
                <div className="flex items-center justify-between gap-2 md:contents">
                  <span className="font-medium text-status-tunnel">
                    {forward.type}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium md:order-4",
                      forward.status === "active"
                        ? "text-status-tunnel"
                        : "text-status-idle",
                    )}
                  >
                    {forward.status}
                  </span>
                </div>
                <span className="mt-1.5 block truncate text-foreground md:order-2 md:mt-0">
                  {forward.local}
                </span>
                <span className="mt-0.5 block truncate text-muted-foreground md:order-3 md:mt-0">
                  {forward.remote}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
