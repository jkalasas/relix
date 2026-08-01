import { useState, type ReactNode } from "react";
import { ArrowLeft, FolderPlus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SessionChip } from "@/components/status/session-chip";
import { StatusDot } from "@/components/status/status-dot";
import { isLocalHost } from "@/features/hosts/lib/local-host";
import type { Host } from "@/features/hosts/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type SessionHeaderProps = {
  host: Host;
  scopeLabel: string;
  scopePath?: string | null;
  scopeHint?: string | null;
  connecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onBack?: () => void;
  onSaveProject?: () => void;
  leadingExtra?: ReactNode;
  trailingExtra?: ReactNode;
  variant?: "default" | "titlebar";
  className?: string;
};

function shortScopePath(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  if (!trimmed) return path;
  const sep = path.includes("\\") ? "\\" : "/";
  const parts = trimmed.split(/[/\\]+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(sep);
  return parts.slice(-2).join(sep);
}

function secondaryDisplay(
  scopeHint: string | null | undefined,
  scopePath: string | null | undefined,
  target: string,
  compact: boolean,
): string {
  const hint = scopeHint?.trim();
  if (hint) return hint;
  const path = scopePath?.trim();
  if (path) return compact ? shortScopePath(path) : path;
  return target;
}

export function SessionHeader({
  host,
  scopeLabel,
  scopePath,
  scopeHint,
  connecting = false,
  onConnect,
  onDisconnect,
  onEdit,
  onBack,
  onSaveProject,
  leadingExtra,
  trailingExtra,
  variant = "default",
  className,
}: SessionHeaderProps) {
  const local = isLocalHost(host);
  const target = local
    ? "local shell"
    : `${host.user}@${host.hostname}:${host.port}`;
  const isConnected = host.status === "connected";
  const titlebar = variant === "titlebar";
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [moreOpen, setMoreOpen] = useState(false);

  const fullSecondary = scopePath?.trim()
    ? `${scopeLabel} · ${scopePath}`
    : scopeLabel;
  const secondary = secondaryDisplay(
    scopeHint,
    scopePath,
    target,
    !isDesktop && !titlebar,
  );

  const hasRemoteActions = !local;
  const hasMoreItems = Boolean(onSaveProject) || hasRemoteActions;

  const inlineActions = (
    <div
      className={cn(
        "flex shrink-0 items-center",
        titlebar ? "gap-1.5" : "gap-1.5 sm:gap-2",
      )}
    >
      <SessionChip status={host.status} />
      {onSaveProject ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSaveProject}
          className={cn(
            titlebar
              ? "h-7 gap-1 px-2 text-[12px]"
              : "min-h-9 gap-1 px-3 md:min-h-7",
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
        {trailingExtra}
        {inlineActions}
      </div>
    );
  }

  return (
    <header
      className={cn(
        "shrink-0 border-b border-border pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="flex h-12 items-center gap-1 px-2 sm:px-3 md:h-10 md:gap-1.5 md:px-3">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to projects"
            className="size-9 shrink-0 md:size-8"
          >
            <ArrowLeft />
          </Button>
        ) : null}

        {leadingExtra}

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-foreground">
            <StatusDot
              status={host.status}
              className="size-1.5 shrink-0 md:hidden"
            />
            <span className="truncate">
              {host.name}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {scopeLabel}
              </span>
            </span>
          </p>
          <p
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={fullSecondary}
          >
            {secondary}
          </p>
        </div>

        {trailingExtra}

        {isDesktop ? (
          inlineActions
        ) : hasMoreItems ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Session actions"
            className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        ) : null}
      </div>

      {!isDesktop && hasMoreItems ? (
        <Drawer
          open={moreOpen}
          onOpenChange={setMoreOpen}
          swipeDirection="down"
          showSwipeHandle
        >
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="truncate">
                {host.name}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {scopeLabel}
                </span>
              </DrawerTitle>
            </DrawerHeader>
            <DrawerFooter className="gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex justify-start pb-1">
                <SessionChip status={host.status} />
              </div>
              {onSaveProject ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full gap-2"
                  onClick={() => {
                    setMoreOpen(false);
                    onSaveProject();
                  }}
                >
                  <FolderPlus className="size-3.5" />
                  Save project
                </Button>
              ) : null}
              {local ? null : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 w-full"
                    onClick={() => {
                      setMoreOpen(false);
                      onEdit();
                    }}
                  >
                    Edit host
                  </Button>
                  {isConnected ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="min-h-11 w-full"
                      onClick={() => {
                        setMoreOpen(false);
                        onDisconnect();
                      }}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 w-full"
                      disabled={connecting}
                      onClick={() => {
                        setMoreOpen(false);
                        onConnect();
                      }}
                    >
                      {connecting ? "Connecting…" : "Connect"}
                    </Button>
                  )}
                </>
              )}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : null}
    </header>
  );
}
