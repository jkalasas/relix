import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionChip } from "@/components/session-chip";
import type { Host } from "@/lib/types";

type SessionHeaderProps = {
  host: Host;
  onConnect: () => void;
  onDisconnect: () => void;
  onBack?: () => void;
};

export function SessionHeader({
  host,
  onConnect,
  onDisconnect,
  onBack,
}: SessionHeaderProps) {
  const target = `${host.user}@${host.hostname}:${host.port}`;
  const isConnected = host.status === "connected";

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 md:h-12 md:flex-nowrap md:py-0 md:pt-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to hosts"
            className="shrink-0 md:hidden"
          >
            <ArrowLeft />
          </Button>
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-foreground">{target}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {host.name}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SessionChip status={host.status} className="max-sm:hidden" />
        {isConnected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            className="min-h-9 px-3 md:min-h-7"
          >
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onConnect}
            className="min-h-9 px-3 md:min-h-7"
          >
            Connect
          </Button>
        )}
      </div>
    </header>
  );
}
