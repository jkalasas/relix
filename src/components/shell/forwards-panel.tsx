import { ArrowLeftRight, Pencil, Play, Plus, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatForwardSource,
  formatForwardTarget,
} from "@/lib/forwards";
import { cn } from "@/lib/utils";
import type { Host, PortForward } from "@/lib/types";

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
          {!connected && forwards.length > 0
            ? " · connect to start"
            : null}
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

function ForwardRow({
  forward,
  connected,
  onStart,
  onStop,
  onEdit,
  onDelete,
}: {
  forward: PortForward;
  connected: boolean;
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const active = forward.status === "active";
  const errored = forward.status === "error";
  const source = formatForwardSource(forward);
  const target = formatForwardTarget(forward);
  const label = target ? `${source} → ${target}` : `${source} SOCKS5`;

  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-3 font-mono text-xs md:grid md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-center md:gap-3 md:py-2.5">
      <div className="flex items-center justify-between gap-2 md:contents">
        <span className="font-medium text-status-tunnel">{forward.type}</span>
        <span
          className={cn(
            "text-[11px] font-medium md:order-4",
            active
              ? "text-status-tunnel"
              : errored
                ? "text-destructive"
                : "text-status-idle",
          )}
          title={forward.errorMessage}
        >
          {forward.status}
        </span>
      </div>
      <span className="mt-1.5 block truncate text-foreground md:order-2 md:mt-0">
        {source}
      </span>
      <span className="mt-0.5 block truncate text-muted-foreground md:order-3 md:mt-0">
        {target ? `→ ${target}` : "SOCKS5"}
      </span>
      {forward.errorMessage ? (
        <p className="mt-1.5 text-[11px] text-destructive md:col-span-full md:order-6 md:mt-1">
          {forward.errorMessage}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 md:order-5 md:mt-0 md:justify-end">
        {active ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onStop}
            className="min-h-9 px-2.5 md:min-h-7"
            aria-label={`Stop tunnel ${label}`}
          >
            <Square data-icon="inline-start" className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onStart}
            disabled={!connected}
            className="min-h-9 px-2.5 md:min-h-7"
            aria-label={`Start tunnel ${label}`}
          >
            <Play data-icon="inline-start" className="size-3.5" />
            Start
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onEdit}
          disabled={active}
          className="min-h-9 px-2.5 md:min-h-7"
          aria-label={`Edit tunnel ${label}`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="min-h-9 px-2.5 text-destructive hover:text-destructive md:min-h-7"
          aria-label={`Delete tunnel ${label}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}
