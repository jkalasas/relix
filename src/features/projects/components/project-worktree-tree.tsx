import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/workspace/field";
import { basename, joinFsPath, parentPath } from "@/features/files";
import { useGitWorktrees, type GitWorktreeEntry } from "@/features/git";
import { pathsMatch } from "@/features/projects/lib/project-root";
import { projectWorkspaceId } from "@/features/projects/lib/workspace-id";
import type { ProjectConfig } from "@/features/projects/types";
import { cn } from "@/lib/utils";

function worktreeLabel(entry: GitWorktreeEntry): string {
  if (entry.branch) return entry.branch;
  if (entry.head) {
    const short = entry.head.length >= 7 ? entry.head.slice(0, 7) : entry.head;
    return `detached · ${short}`;
  }
  return basename(entry.path) || entry.path;
}

function workspaceHasActivity(
  openWorkspaceIds: Set<string>,
  id: string,
): boolean {
  return openWorkspaceIds.has(id);
}

type ProjectWorktreeTreeProps = {
  hostId: string;
  projects: ProjectConfig[];
  activeProjectId: string | null;
  activeWorktreePath: string | null;
  adhocActive: boolean;
  connected: boolean;
  openWorkspaceIds: Set<string>;
  onOpenAdhoc: () => void;
  onSelectWorktree: (projectId: string, worktreePath: string | null) => void;
  onAddProject: () => void;
  onEditProject: (projectId: string) => void;
  onSetWorktree: (projectId: string, worktreePath: string | null) => void;
};

function useExpandedProjects(hostId: string) {
  const storageKey = `relix.tree-expanded:${hostId}`;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // ignore
    }
    return {};
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(expanded));
    } catch {
      // ignore
    }
  }, [expanded, storageKey]);
  const isExpanded = (projectId: string) => {
    if (projectId in expanded) return expanded[projectId];
    return true;
  };
  const toggle = (projectId: string) =>
    setExpanded((current) => ({
      ...current,
      [projectId]: !isExpanded(projectId),
    }));
  const expand = (projectId: string) =>
    setExpanded((current) =>
      current[projectId] === true || !(projectId in current)
        ? current
        : { ...current, [projectId]: true },
    );
  return { isExpanded, toggle, expand };
}

function AddWorktreeDialog({
  project,
  open,
  busy,
  onOpenChange,
  onSubmit,
}: {
  project: ProjectConfig;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    path: string;
    branch: string | null;
    createBranch: boolean;
    startPoint: string | null;
  }) => void;
}) {
  const homeParent = parentPath(project.path) ?? project.path;
  const homeBase = basename(project.path) || "worktree";
  const [branch, setBranch] = useState("");
  const [path, setPath] = useState(() =>
    joinFsPath(homeParent, `${homeBase}-worktree`),
  );
  const [startPoint, setStartPoint] = useState("");
  useEffect(() => {
    if (open) {
      setBranch("");
      setPath(joinFsPath(homeParent, `${homeBase}-worktree`));
      setStartPoint("");
    }
  }, [open, homeParent, homeBase]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add worktree</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!path.trim()) return;
            onSubmit({
              path: path.trim(),
              branch: branch.trim() || null,
              createBranch: Boolean(branch.trim()),
              startPoint: startPoint.trim() || null,
            });
          }}
        >
          <Field label="Path">
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              required
            />
          </Field>
          <Field label="Branch">
            <Input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="optional — detach if empty"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </Field>
          <Field label="Start point">
            <Input
              value={startPoint}
              onChange={(event) => setStartPoint(event.target.value)}
              placeholder="HEAD"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </Field>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !path.trim()}>
              {busy ? "Adding…" : "Add worktree"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectRow({
  hostId,
  project,
  active,
  activeWorktreePath,
  connected,
  openWorkspaceIds,
  defaultExpanded,
  expanded,
  onToggle,
  onSelect,
  onEdit,
}: {
  hostId: string;
  project: ProjectConfig;
  active: boolean;
  activeWorktreePath: string | null;
  connected: boolean;
  openWorkspaceIds: Set<string>;
  defaultExpanded: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (worktreePath: string | null) => void;
  onEdit: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GitWorktreeEntry | null>(
    null,
  );
  const worktrees = useGitWorktrees({
    hostId,
    connected,
    enabled: connected && expanded,
    cwd: project.path,
  });

  const entries = worktrees.worktrees;
  const homeId = projectWorkspaceId(hostId, project.id);
  const showList = connected && !worktrees.error;

  const rows = useMemo(() => {
    if (!showList || entries.length === 0) {
      return [
        {
          key: `home:${project.path}`,
          label: basename(project.path) || project.name,
          sub: project.path,
          path: null as string | null,
          isMain: false,
          entry: null as GitWorktreeEntry | null,
        },
      ];
    }
    return entries.map((entry) => ({
      key: entry.path,
      label: worktreeLabel(entry),
      sub: entry.path,
      path: (pathsMatch(entry.path, project.path)
        ? null
        : entry.path) as string | null,
      isMain: entry.isMain,
      entry,
    }));
  }, [entries, project.name, project.path, showList]);

  return (
    <li>
      <div
        className={cn(
          "group flex h-8 items-center gap-1 pr-1.5 pl-2 text-[13px]",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <button
          type="button"
          aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
          onClick={onToggle}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
        <FolderGit2 className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <button
          type="button"
          onClick={() => onSelect(null)}
          title={project.path}
          className="min-w-0 flex-1 truncate text-left font-medium"
        >
          {project.name}
        </button>
        <button
          type="button"
          aria-label={`Add worktree to ${project.name}`}
          onClick={() => setAddOpen(true)}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Edit ${project.name}`}
          onClick={onEdit}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm px-1 font-mono text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
        >
          …
        </button>
      </div>

      {expanded ? (
        <ul className="flex flex-col gap-px pb-1 pl-8">
          {rows.map((row) => {
            const selected = active
              ? row.path
                ? pathsMatch(row.path, activeWorktreePath ?? "")
                : !activeWorktreePath
              : false;
            const wsId = row.path
              ? projectWorkspaceId(hostId, project.id, row.path)
              : homeId;
            const live = workspaceHasActivity(openWorkspaceIds, wsId);
            void defaultExpanded;
            return (
              <li key={row.key}>
                <div
                  className={cn(
                    "group/row flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 pr-1.5",
                    selected
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      live ? "bg-status-connected" : "bg-status-idle",
                    )}
                    aria-label={live ? "Active session" : "Idle"}
                  />
                  <button
                    type="button"
                    onClick={() => onSelect(row.path)}
                    className="min-w-0 flex-1 text-left"
                    title={row.sub}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] text-foreground">
                        {row.label}
                      </span>
                      {row.isMain ? (
                        <span className="shrink-0 rounded-sm bg-surface px-1 py-px font-mono text-[10px] text-muted-foreground">
                          primary
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {row.sub}
                    </span>
                  </button>
                  {row.entry &&
                  !row.entry.isMain &&
                  !pathsMatch(row.entry.path, activeWorktreePath ?? "\0") ? (
                    <button
                      type="button"
                      aria-label={`Remove worktree ${row.label}`}
                      onClick={() => setRemoveTarget(row.entry)}
                      className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {!connected ? (
            <li className="px-3 py-1 font-mono text-[11px] text-muted-foreground">
              Connect to list worktrees
            </li>
          ) : worktrees.loading && entries.length === 0 ? (
            <li className="px-3 py-1 font-mono text-[11px] text-muted-foreground">
              Loading worktrees…
            </li>
          ) : null}
        </ul>
      ) : null}

      <AddWorktreeDialog
        project={project}
        open={addOpen}
        busy={worktrees.busy}
        onOpenChange={setAddOpen}
        onSubmit={(input) => {
          void worktrees
            .add(input)
            .then((entry) => {
              setAddOpen(false);
              onSelect(
                pathsMatch(entry.path, project.path) ? null : entry.path,
              );
            })
            .catch(() => {});
        }}
      />
      <Dialog
        open={removeTarget != null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove worktree</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Remove {removeTarget ? worktreeLabel(removeTarget) : ""} at{" "}
            {removeTarget?.path}? The directory is deleted when git allows it.
          </p>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRemoveTarget(null)}
              disabled={worktrees.busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={worktrees.busy || !removeTarget}
              onClick={() => {
                if (!removeTarget) return;
                void worktrees
                  .remove(removeTarget.path, false)
                  .then(() => setRemoveTarget(null))
                  .catch(() => {});
              }}
            >
              {worktrees.busy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * Left-rail navigator: Ad hoc + per-host projects with worktree children.
 * Clicking a worktree switches the workspace (tabs follow the worktree).
 */
export function ProjectWorktreeTree({
  hostId,
  projects,
  activeProjectId,
  activeWorktreePath,
  adhocActive,
  connected,
  openWorkspaceIds,
  onOpenAdhoc,
  onSelectWorktree,
  onAddProject,
  onEditProject,
  onSetWorktree,
}: ProjectWorktreeTreeProps) {
  const { isExpanded, toggle } = useExpandedProjects(hostId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-sidebar-border px-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
          Projects
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Add project"
          onClick={onAddProject}
          className="size-7 text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <li>
          <button
            type="button"
            onClick={onOpenAdhoc}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]",
              adhocActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Zap className="size-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">Ad hoc</span>
          </button>
        </li>
        {projects.length === 0 ? (
          <li className="px-2 py-3 text-[12px] text-muted-foreground">
            No projects yet. Add one to pin a directory on this host.
          </li>
        ) : null}
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            hostId={hostId}
            project={project}
            active={activeProjectId === project.id}
            activeWorktreePath={
              activeProjectId === project.id ? activeWorktreePath : null
            }
            connected={connected}
            openWorkspaceIds={openWorkspaceIds}
            defaultExpanded
            expanded={isExpanded(project.id)}
            onToggle={() => toggle(project.id)}
            onSelect={(worktreePath) => {
              onSelectWorktree(project.id, worktreePath);
              onSetWorktree(project.id, worktreePath);
            }}
            onEdit={() => onEditProject(project.id)}
          />
        ))}
      </ul>

      <div className="shrink-0 border-t border-sidebar-border p-1.5">
        <button
          type="button"
          onClick={onOpenAdhoc}
          className={cn(
            "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground",
          )}
        >
          <Folder className="size-3" aria-hidden />
          <span className="truncate">Browse host files</span>
        </button>
      </div>
    </div>
  );
}
