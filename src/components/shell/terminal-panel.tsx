import { TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Host } from "@/lib/types";

type TerminalPanelProps = {
  host: Host;
  onConnect: () => void;
};

export function TerminalPanel({ host, onConnect }: TerminalPanelProps) {
  if (host.status !== "connected") {
    return (
      <EmptyTerminal
        title={
          host.status === "error"
            ? "Last connection failed"
            : "Terminal is idle"
        }
        description={
          host.status === "error"
            ? `Could not reach ${host.user}@${host.hostname}. Check the host, port, or credentials, then try again.`
            : `Connect to ${host.name} to open a shell session.`
        }
        actionLabel={host.status === "error" ? "Retry connect" : "Connect"}
        onAction={onConnect}
      />
    );
  }

  return (
    <div
      role="tabpanel"
      id="panel-terminal"
      aria-labelledby="tab-terminal"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-[oklch(0.12_0.012_250)] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-foreground/90">
        <p className="text-muted-foreground">
          relix — session ready on {host.user}@{host.hostname}
        </p>
        <p className="text-status-connected">
          connected · waiting for PTY backend
        </p>
        <p className="mt-3 flex items-center gap-2">
          <span className="text-primary">{host.user}@{host.name}</span>
          <span className="text-muted-foreground">:</span>
          <span className="text-status-tunnel">~</span>
          <span className="text-muted-foreground">$</span>
          <span
            className="inline-block h-4 w-1.5 translate-y-px bg-primary/90"
            aria-hidden
          />
        </p>
      </div>
    </div>
  );
}

type EmptyTerminalProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

function EmptyTerminal({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyTerminalProps) {
  return (
    <div
      role="tabpanel"
      id="panel-terminal"
      aria-labelledby="tab-terminal"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
        <TerminalSquare className="size-5" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-sm font-medium text-balance">{title}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      <Button type="button" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
