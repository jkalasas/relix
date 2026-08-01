import { ArrowLeft, FolderPlus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SessionChip } from "@/components/status/session-chip";
import { isLocalHost } from "@/features/hosts/lib/local-host";
import type { Host } from "@/features/hosts/types";
import { cn } from "@/lib/utils";

type SessionHeaderProps = {
  host: Host;
  scopeLabel: string;
  scopePath?: string | null;
  connecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onBack?: () => void;
  onSaveProject?: () => void;
  leadingExtra?: ReactNode;
  variant?: "default" | "titlebar";
  className?: string;
};

export function SessionHeader({
  host,
  scopeLabel,
  scopePath,
  connecting = false,
  onConnect,
  onDisconnect,
  onEdit,
  onBack,
  onSaveProject,
  leadingExtra,
  variant = "default",
  className,
}: SessionHeaderProps) {
  const local = isLocalHost(host);
  const target = local
    ? "local shell"
    : `${host.user}@${host.hostname}:${host.port}`;
  const isConnected = host.status === "connected";
  const titlebar = variant === "titlebar";
  const secondary = scopePath?.trim()
    ? `${scopeLabel} · ${scopePath}`
    : scopeLabel;

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
      {onSaveProject ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSaveProject}
          className={cn(
            titlebar ? "h-7 gap-1 px-2 text-[12px]" : "min-h-9 gap-1 px-3 md:min-h-7",
          )}
        >
          <FolderPlus className="size-3.5" />
          <span className={titlebar ? "max-lg:hidden" : undefined}>
            Save project
          </span>
        </Button>
      ) : null}
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
          "flex h-full min-w-0 shrink-0 items-center gap-2 pl-1",
          className,
        )}
      >
        {leadingExtra}
        <div className="min-w-0 max-w-[16rem]">
          <p
            className="truncate font-mono text-xs text-muted-foreground"
            title={`${host.name} · ${target}`}
          >
            {host.name}
            <span className="text-muted-foreground/70"> · {scopeLabel}</span>
          </p>
        </div>
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
              aria-label="Back to projects"
              className="size-9 shrink-0"
            >
              <ArrowLeft />
            </Button>
          ) : null}
          {leadingExtra}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {host.name}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {scopeLabel}
              </span>
            </p>
            <p
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={secondary}
            >
              {scopePath?.trim() ? scopePath : target}
            </p>
          </div>
        </div>
        {actions}
      </div>
    </header>
  );
}
