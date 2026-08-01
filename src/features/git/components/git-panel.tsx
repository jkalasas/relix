import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/workspace/empty-state";
import { GitDiffView } from "@/features/git/components/git-diff-view";
import { GitDiscardDialog } from "@/features/git/components/git-discard-dialog";
import { GitFileRow } from "@/features/git/components/git-file-row";
import type { GitController } from "@/features/git/hooks/use-git";
import type { DiscardEntry, GitChangedFile } from "@/features/git/types";
import type { Host } from "@/features/hosts";
import { cn } from "@/lib/utils";

type GitPanelProps = {
  host: Host;
  git: GitController;
  onConnect: () => void;
};

function branchSummary(git: GitController): string | null {
  const status = git.snapshot?.status;
  const repo = git.snapshot?.repo;
  if (status) {
    if (status.isDetached) return `detached ${status.branch}`;
    return status.branch;
  }
  if (repo) {
    if (repo.isDetached) return `detached ${repo.branch}`;
    return repo.branch;
  }
  return null;
}

function aheadBehindLabel(status: {
  ahead: number;
  behind: number;
} | null): string | null {
  if (!status) return null;
  const parts: string[] = [];
  if (status.ahead > 0) parts.push(`↑${status.ahead}`);
  if (status.behind > 0) parts.push(`↓${status.behind}`);
  return parts.length > 0 ? parts.join(" ") : null;
}

function partitionFiles(files: GitChangedFile[]) {
  const staged: GitChangedFile[] = [];
  const changes: GitChangedFile[] = [];
  for (const file of files) {
    if (file.staged) staged.push(file);
    if (file.unstaged || file.untracked) changes.push(file);
  }
  return { staged, changes };
}

function SectionHeader({
  label,
  count,
  actionLabel,
  onAction,
  onOpenDiff,
  disabled,
}: {
  label: string;
  count: number;
  actionLabel?: string;
  onAction?: () => void;
  onOpenDiff?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-2 border-b border-border bg-surface/60 px-3 sm:px-4">
      {onOpenDiff ? (
        <button
          type="button"
          onClick={onOpenDiff}
          disabled={disabled}
          className="min-h-7 rounded-sm text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          aria-label={`View all ${label.toLowerCase()} changes`}
        >
          {label}
          <span className="ml-1.5 font-mono normal-case tabular-nums">
            {count}
          </span>
        </button>
      ) : (
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
          <span className="ml-1.5 font-mono normal-case tabular-nums">
            {count}
          </span>
        </p>
      )}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function GitPanel({ host, git, onConnect }: GitPanelProps) {
  const connected = host.status === "connected";
  const [discardTarget, setDiscardTarget] = useState<DiscardEntry | null>(null);

  const files = git.snapshot?.status?.changedFiles ?? [];
  const hasRepo = git.snapshot?.repo != null || git.snapshot?.status != null;
  const branch = branchSummary(git);
  const tracking = aheadBehindLabel(git.snapshot?.status ?? null);
  const { staged, changes } = useMemo(() => partitionFiles(files), [files]);
  const canNetwork = hasRepo && connected && !git.busy;
  const canCommit =
    connected && !git.busy && staged.length > 0 && git.commitMessage.trim().length > 0;
  const showList = hasRepo && files.length > 0 && !git.loading;

  const blockingEmpty = (() => {
    if (!connected) {
      return (
        <EmptyState
          icon={GitBranch}
          title="Host offline"
          description="Connect this host to inspect the git worktree for the current path."
          action={
            <Button
              type="button"
              size="sm"
              onClick={onConnect}
              className="min-h-10 px-4 md:min-h-7"
            >
              Connect
            </Button>
          }
        />
      );
    }

    if (!git.path) {
      return (
        <EmptyState
          icon={GitBranch}
          title="No path yet"
          description="Open a shell so the workspace has a cwd, or use a project with a saved directory."
        />
      );
    }

    if (git.loading && !git.snapshot) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading status…
        </div>
      );
    }

    if (git.error) {
      const code = git.error.code;
      if (code === "not_installed" || code === "too_old") {
        return (
          <EmptyState
            icon={GitBranch}
            title="Git unavailable"
            description={git.error.message}
          />
        );
      }
      if (code === "not_connected") {
        return (
          <EmptyState
            icon={GitBranch}
            title="Host offline"
            description={git.error.message}
            action={
              <Button
                type="button"
                size="sm"
                onClick={onConnect}
                className="min-h-10 px-4 md:min-h-7"
              >
                Connect
              </Button>
            }
          />
        );
      }
      if (code === "not_a_directory" || code === "invalid_path") {
        return (
          <EmptyState
            icon={GitBranch}
            title="Path unavailable"
            description={git.error.message}
          />
        );
      }
    }

    if (!hasRepo && !git.loading) {
      return (
        <EmptyState
          icon={GitBranch}
          title="Not a git repository"
          description="No repo found at this path. Open a project or shell inside a worktree."
        />
      );
    }

    return null;
  })();

  if (git.selectedDiff) {
    return (
      <div
        role="tabpanel"
        id="session-panel-git"
        className="flex min-h-0 flex-1 flex-col"
      >
        <GitDiffView
          selection={git.selectedDiff}
          loading={git.diffLoading}
          error={git.diffError}
          result={git.diffResult}
          onBack={git.closeDiff}
        />
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="session-panel-git"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-4 md:h-10 md:min-h-0">
        <div className="min-w-0 flex flex-col gap-0.5 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            {branch ? (
              <span className="truncate font-mono text-foreground">
                {branch}
              </span>
            ) : (
              <span>Git</span>
            )}
            {tracking ? (
              <span className="shrink-0 font-mono text-[11px] tabular-nums">
                {tracking}
              </span>
            ) : null}
            {hasRepo && files.length > 0 ? (
              <span className="shrink-0 text-[11px] tabular-nums">
                {files.length} change{files.length === 1 ? "" : "s"}
              </span>
            ) : null}
            {git.snapshot?.status?.truncated ? (
              <span className="shrink-0 text-[11px]">truncated</span>
            ) : null}
          </div>
          {git.snapshot?.status?.repoRoot || git.snapshot?.repo?.repoRoot ? (
            <p
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={
                git.snapshot.status?.repoRoot ??
                git.snapshot.repo?.repoRoot ??
                undefined
              }
            >
              {git.snapshot.status?.repoRoot ?? git.snapshot.repo?.repoRoot}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void git.refresh()}
            disabled={!connected || git.busy || git.loading || !git.path}
            className="size-9 text-muted-foreground hover:text-foreground md:size-7"
            aria-label="Refresh git status"
          >
            <RefreshCw
              className={cn("size-3.5", git.loading && "animate-spin")}
            />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canNetwork}
                  className="min-h-9 gap-1 px-2 text-muted-foreground hover:text-foreground md:min-h-7"
                />
              }
            >
              Sync
              <ChevronDown className="size-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              <DropdownMenuItem
                disabled={!canNetwork}
                onClick={() => git.fetch()}
              >
                Fetch
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canNetwork}
                onClick={() => git.pull()}
              >
                <ArrowDownToLine className="size-3.5 text-muted-foreground" />
                Pull (ff-only)
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canNetwork}
                onClick={() => git.push()}
              >
                <ArrowUpFromLine className="size-3.5 text-muted-foreground" />
                Push
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {git.error && hasRepo ? (
        <p
          className="shrink-0 border-b border-border px-3 py-1.5 text-[12px] text-destructive sm:px-4"
          role="alert"
        >
          {git.error.message}
        </p>
      ) : null}

      {blockingEmpty ? (
        blockingEmpty
      ) : showList ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {staged.length > 0 ? (
            <section aria-label="Staged">
              <SectionHeader
                label="Staged"
                count={staged.length}
                actionLabel="Unstage all"
                onAction={() => git.unstage(staged.map((file) => file.path))}
                onOpenDiff={() => git.openDiffAll("staged")}
                disabled={git.busy}
              />
              <ul>
                {staged.map((file) => (
                  <GitFileRow
                    key={`staged:${file.path}:${file.originalPath ?? ""}`}
                    file={file}
                    mode="staged"
                    busy={git.busy}
                    onOpen={() => git.openDiff(file, "staged")}
                    onStage={() => git.stage([file.path])}
                    onUnstage={() => git.unstage([file.path])}
                    onDiscard={() => {}}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {changes.length > 0 ? (
            <section aria-label="Changes">
              <SectionHeader
                label="Changes"
                count={changes.length}
                actionLabel="Stage all"
                onAction={() => git.stage(changes.map((file) => file.path))}
                onOpenDiff={() => git.openDiffAll("changes")}
                disabled={git.busy}
              />
              <ul>
                {changes.map((file) => (
                  <GitFileRow
                    key={`changes:${file.path}:${file.originalPath ?? ""}`}
                    file={file}
                    mode="changes"
                    busy={git.busy}
                    onOpen={() => git.openDiff(file, "changes")}
                    onStage={() => git.stage([file.path])}
                    onUnstage={() => git.unstage([file.path])}
                    onDiscard={() =>
                      setDiscardTarget({
                        path: file.path,
                        untracked: file.untracked,
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : hasRepo ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
          Working tree clean
        </div>
      ) : null}

      {hasRepo ? (
        <div className="shrink-0 border-t border-border px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Commit message</span>
              <textarea
                value={git.commitMessage}
                onChange={(event) => git.setCommitMessage(event.target.value)}
                rows={2}
                spellCheck={false}
                disabled={!connected || git.busy || staged.length === 0}
                placeholder={
                  staged.length === 0
                    ? "Stage changes to commit"
                    : "Commit message"
                }
                className={cn(
                  "w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-base md:text-xs",
                  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
            </label>
            <Button
              type="button"
              size="sm"
              onClick={() => void git.commit()}
              disabled={!canCommit}
              className="min-h-10 shrink-0 px-3 md:min-h-7"
            >
              Commit
              {staged.length > 0 ? (
                <span className="font-mono text-[11px] opacity-80">
                  {staged.length}
                </span>
              ) : null}
            </Button>
          </div>
          {git.error?.code === "empty_commit_message" ? (
            <p className="mt-1.5 text-[12px] text-destructive" role="alert">
              {git.error.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <GitDiscardDialog
        open={discardTarget != null}
        path={discardTarget?.path ?? ""}
        untracked={discardTarget?.untracked ?? false}
        onOpenChange={(open) => {
          if (!open) setDiscardTarget(null);
        }}
        onDiscard={() => {
          if (!discardTarget) return;
          git.discard([discardTarget]);
          setDiscardTarget(null);
        }}
      />
    </div>
  );
}
