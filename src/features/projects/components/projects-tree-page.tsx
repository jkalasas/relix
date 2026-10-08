import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isLocalHost, type Host } from "@/features/hosts";
import {
  ProjectWorktreeTree,
  type ProjectConfig,
} from "@/features/projects";
import { cn } from "@/lib/utils";

type ProjectsTreePageProps = {
  host: Host;
  projects: ProjectConfig[];
  connecting?: boolean;
  openWorkspaceIds: Set<string>;
  onBack: () => void;
  onOpenAdhoc: () => void;
  onSelectWorktree: (projectId: string, worktreePath: string | null) => void;
  onAddProject: () => void;
  onEditProject: (projectId: string) => void;
  onSetWorktree: (projectId: string, worktreePath: string | null) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onEditHost: () => void;
  headerExtra?: ReactNode;
  className?: string;
};

/**
 * Mobile projects surface: the same project/worktree tree as the desktop
 * rail, as a full page. Unlike the desktop cards page it can switch
 * worktrees directly, so Back → tap is the whole mobile switching flow.
 */
export function ProjectsTreePage({
  host,
  projects,
  connecting = false,
  openWorkspaceIds,
  onBack,
  onOpenAdhoc,
  onSelectWorktree,
  onAddProject,
  onEditProject,
  onSetWorktree,
  onConnect,
  onDisconnect,
  onEditHost,
  headerExtra,
  className,
}: ProjectsTreePageProps) {
  const local = isLocalHost(host);
  const target = local
    ? "local shell"
    : `${host.user}@${host.hostname}:${host.port}`;
  const isConnected = host.status === "connected";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-background text-foreground",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              aria-label="Back to hosts"
              className="size-9 shrink-0"
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                {host.name}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {target}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerExtra}
            {local ? null : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onEditHost}
                  className="min-h-9 px-3"
                >
                  Edit
                </Button>
                {isConnected ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onDisconnect}
                    className="min-h-9 px-3"
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onConnect}
                    disabled={connecting}
                    className="min-h-9 px-3"
                  >
                    {connecting ? "Connecting…" : "Connect"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
        <ProjectWorktreeTree
          hostId={host.id}
          projects={projects}
          activeProjectId={null}
          activeWorktreePath={null}
          adhocActive={false}
          connected={isConnected || local}
          openWorkspaceIds={openWorkspaceIds}
          onOpenAdhoc={onOpenAdhoc}
          onSelectWorktree={onSelectWorktree}
          onAddProject={onAddProject}
          onEditProject={onEditProject}
          onSetWorktree={onSetWorktree}
        />
      </div>
    </div>
  );
}
