import {
  ArrowLeft,
  FolderGit2,
  FolderOpen,
  Pencil,
  Plus,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionChip } from "@/components/status/session-chip";
import { StatusDot } from "@/components/status/status-dot";
import { EmptyState } from "@/components/workspace/empty-state";
import { isLocalHost } from "@/features/hosts/local-host";
import type { Host } from "@/features/hosts/types";
import type { ProjectConfig } from "@/features/projects/types";
import { cn } from "@/lib/utils";

type ProjectsPageProps = {
  host: Host;
  projects: ProjectConfig[];
  connecting?: boolean;
  openWorkspaceIds?: Set<string>;
  onBack: () => void;
  onOpenAdhoc: () => void;
  onOpenProject: (projectId: string) => void;
  onAddProject: () => void;
  onEditProject: (projectId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onEditHost: () => void;
  className?: string;
};

export function ProjectsPage({
  host,
  projects,
  connecting = false,
  openWorkspaceIds,
  onBack,
  onOpenAdhoc,
  onOpenProject,
  onAddProject,
  onEditProject,
  onConnect,
  onDisconnect,
  onEditHost,
  className,
}: ProjectsPageProps) {
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
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-4 md:h-12 md:flex-nowrap md:py-0">
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
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <SessionChip status={host.status} className="max-sm:hidden" />
            {local ? null : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onEditHost}
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

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-3 py-5 sm:px-4">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Workspace
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenAdhoc}
              className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary">
                <Terminal className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">Ad hoc</span>
                  {openWorkspaceIds?.has(`${host.id}::adhoc`) ? (
                    <StatusDot status="connected" className="size-1.5" />
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  No project — files follow shell cwd
                </span>
              </span>
            </button>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Projects
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onAddProject}
                className="h-8 gap-1 px-2 text-[12px]"
              >
                <Plus className="size-3.5" />
                Project
              </Button>
            </div>

            {projects.length === 0 ? (
              <EmptyState
                icon={FolderGit2}
                title="No projects yet"
                description="Save a directory on this host to open shells and files rooted there."
                className="rounded-lg border border-border bg-surface py-10"
                action={
                  <Button type="button" size="sm" onClick={onAddProject}>
                    Add project
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-1.5" aria-label="Projects">
                {projects.map((project) => {
                  const open = openWorkspaceIds?.has(
                    `${host.id}::project::${project.id}`,
                  );
                  return (
                    <li key={project.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onOpenProject(project.id)}
                        className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                          <FolderOpen className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {project.name}
                            </span>
                            {open ? (
                              <StatusDot
                                status="connected"
                                className="size-1.5"
                              />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[12px] text-muted-foreground">
                            {project.path}
                          </span>
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${project.name}`}
                        onClick={() => onEditProject(project.id)}
                        className="absolute right-2 top-1/2 size-8 -translate-y-1/2 text-muted-foreground opacity-100 hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
