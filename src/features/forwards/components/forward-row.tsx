import { Pencil, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatForwardSource,
  formatForwardTarget,
} from "@/features/forwards/lib/format";
import type { PortForward } from "@/features/forwards/types";
import { cn } from "@/lib/utils";

type ForwardRowProps = {
  forward: PortForward;
  connected: boolean;
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function ForwardRow({
  forward,
  connected,
  onStart,
  onStop,
  onEdit,
  onDelete,
}: ForwardRowProps) {
  const active = forward.status === "active";
  const errored = forward.status === "error";
  const source = formatForwardSource(forward);
  const target = formatForwardTarget(forward);
  const label = target ? `${source} → ${target}` : `${source} SOCKS5`;

  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-3 font-mono text-xs md:grid md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-center md:gap-3 md:px-3 md:py-2">
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
