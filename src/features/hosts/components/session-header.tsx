import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionChip } from "@/components/status/session-chip";
import { isLocalHost } from "@/features/hosts/local-host";
import type { Host } from "@/features/hosts/types";

type SessionHeaderProps = {
  host: Host;
  connecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onBack?: () => void;
};

export function SessionHeader({
  host,
  connecting = false,
  onConnect,
  onDisconnect,
  onEdit,
  onBack,
}: SessionHeaderProps) {
  const local = isLocalHost(host);
  const target = local
    ? "local shell"
    : `${host.user}@${host.hostname}:${host.port}`;
  const isConnected = host.status === "connected";

  return (
    <header className="shrink-0 border-b border-border">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-4 md:h-12 md:flex-nowrap md:py-0">
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
          {local ? null : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="min-h-9 px-3 md:min-h-7"
              >
                Edit
              </Button>
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
                  disabled={connecting}
                  className="min-h-9 px-3 md:min-h-7"
                >
                  {connecting ? "Connecting…" : "Connect"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
