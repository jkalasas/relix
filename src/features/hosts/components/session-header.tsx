import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionChip } from "@/components/status/session-chip";
import { isLocalHost } from "@/features/hosts/local-host";
import type { Host } from "@/features/hosts/types";
import { cn } from "@/lib/utils";

type SessionHeaderProps = {
  host: Host;
  connecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onBack?: () => void;
  variant?: "default" | "titlebar";
  className?: string;
};

export function SessionHeader({
  host,
  connecting = false,
  onConnect,
  onDisconnect,
  onEdit,
  onBack,
  variant = "default",
  className,
}: SessionHeaderProps) {
  const local = isLocalHost(host);
  const target = local
    ? "local shell"
    : `${host.user}@${host.hostname}:${host.port}`;
  const isConnected = host.status === "connected";
  const titlebar = variant === "titlebar";

  const actions = (
    <div
      className={cn(
        "flex shrink-0 items-center",
        titlebar ? "gap-1.5" : "gap-1.5 sm:gap-2",
      )}
    >
      <SessionChip
        status={host.status}
        className={titlebar ? undefined : "max-sm:hidden"}
      />
      {local ? null : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className={cn(
              titlebar ? "h-7 px-2 text-[12px]" : "min-h-9 px-3 md:min-h-7",
            )}
          >
            Edit
          </Button>
          {isConnected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              className={cn(
                titlebar ? "h-7 px-2 text-[12px]" : "min-h-9 px-3 md:min-h-7",
              )}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onConnect}
              disabled={connecting}
              className={cn(
                titlebar ? "h-7 px-2 text-[12px]" : "min-h-9 px-3 md:min-h-7",
              )}
            >
              {connecting ? "Connecting…" : "Connect"}
            </Button>
          )}
        </>
      )}
    </div>
  );

  if (titlebar) {
    return (
      <div
        className={cn(
          "flex h-full min-w-0 shrink-0 items-center gap-3 pl-2",
          className,
        )}
      >
        <p
          className="max-w-[14rem] truncate font-mono text-xs text-muted-foreground"
          title={target}
        >
          {target}
        </p>
        {actions}
      </div>
    );
  }

  return (
    <header className={cn("shrink-0 border-b border-border", className)}>
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-2 py-2 sm:px-3 md:h-10 md:flex-nowrap md:px-3 md:py-0">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              aria-label="Back to hosts"
              className="size-9 shrink-0 md:hidden"
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-foreground">{target}</p>
            <p className="truncate text-[11px] text-muted-foreground md:hidden">
              {host.name}
            </p>
          </div>
        </div>
        {actions}
      </div>
    </header>
  );
}
