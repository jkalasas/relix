import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  GitBranch,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/workspace/field";
import { basename, joinFsPath, parentPath } from "@/features/files";
import type {
  AddWorktreeInput,
  GitCommandError,
  GitWorktreeEntry,
  GitWorktreesController,
} from "@/features/git";
import {
  pathsMatch,
  projectActiveRoot,
} from "@/features/projects/lib/project-root";
import type { ProjectConfig } from "@/features/projects/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type WorktreeSwitcherProps = {
  project: ProjectConfig;
  worktrees: GitWorktreesController;
  connected: boolean;
  onSelect: (worktreePath: string | null) => void;
  className?: string;
};

function worktreeLabel(entry: GitWorktreeEntry): string {
  if (entry.branch) return entry.branch;
  if (entry.head) {
    const short =
      entry.head.length >= 7 ? entry.head.slice(0, 7) : entry.head;
    return `detached · ${short}`;
  }
  return basename(entry.path) || entry.path;
}

function WorktreeRow({
  entry,
  active,
  isHome,
  busy,
  onSelect,
  onRemove,
}: {
  entry: GitWorktreeEntry;
  active: boolean;
  isHome: boolean;
  busy: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md",
        active ? "bg-elevated" : undefined,
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={busy || entry.bare}
        className={cn(
          "flex min-h-10 min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors",
          "hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
          "md:min-h-8 md:py-1.5",
        )}
      >
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
          {active ? <Check className="size-3.5 text-foreground" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] text-foreground">
              {worktreeLabel(entry)}
            </span>
            {entry.isMain ? (
              <span className="rounded-sm bg-surface px-1 py-px font-mono text-[10px] text-muted-foreground">
                main
              </span>
            ) : null}
            {isHome ? (
              <span className="rounded-sm bg-surface px-1 py-px font-mono text-[10px] text-muted-foreground">
                home
              </span>
            ) : null}
            {entry.locked ? (
              <span className="rounded-sm bg-surface px-1 py-px font-mono text-[10px] text-muted-foreground">
                locked
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            {entry.path}
          </span>
        </span>
      </button>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove worktree ${worktreeLabel(entry)}`}
          disabled={busy}
          onClick={onRemove}
          className="mr-1 size-9 shrink-0 text-muted-foreground hover:text-destructive md:size-7"
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function WorktreeList({
  project,
  entries,
  activePath,
  busy,
  onSelect,
  onRemove,
  onAdd,
}: {
  project: ProjectConfig;
  entries: GitWorktreeEntry[];
  activePath: string;
  busy: boolean;
  onSelect: (path: string | null) => void;
  onRemove: (entry: GitWorktreeEntry) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {entries.length === 0 ? (
        <p className="px-2 py-3 text-[13px] text-muted-foreground">
          No worktrees for this path.
        </p>
      ) : (
        entries.map((entry) => {
          const active = pathsMatch(entry.path, activePath);
          const isHome = pathsMatch(entry.path, project.path);
          const canRemove = !entry.isMain && !active;
          return (
            <WorktreeRow
              key={entry.path}
              entry={entry}
              active={active}
              isHome={isHome}
              busy={busy}
              onSelect={() => onSelect(isHome ? null : entry.path)}
              onRemove={canRemove ? () => onRemove(entry) : undefined}
            />
          );
        })
      )}
      <div className="mt-1 border-t border-border pt-1">
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          className={cn(
            "flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-muted-foreground outline-none transition-colors",
            "hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:opacity-50",
            "md:min-h-8 md:py-1.5",
          )}
        >
          <Plus className="size-3.5" />
          Add worktree…
        </button>
      </div>
    </div>
  );
}

function AddWorktreeForm({
  project,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  project: ProjectConfig;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: AddWorktreeInput) => void;
}) {
  const homeParent = parentPath(project.path) ?? project.path;
  const homeBase = basename(project.path) || "worktree";
  const [branch, setBranch] = useState("");
  const [createBranch, setCreateBranch] = useState(true);
  const [path, setPath] = useState(() =>
    joinFsPath(homeParent, `${homeBase}-worktree`),
  );
  const [startPoint, setStartPoint] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextPath = path.trim();
    const nextBranch = branch.trim();
    if (!nextPath) return;
    onSubmit({
      path: nextPath,
      branch: nextBranch || null,
      createBranch: nextBranch ? createBranch : false,
      startPoint: startPoint.trim() || null,
    });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
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
      {branch.trim() ? (
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={createBranch}
            onChange={(event) => setCreateBranch(event.target.checked)}
            disabled={busy}
            className="size-4 accent-primary"
          />
          Create branch
        </label>
      ) : null}
      {createBranch && branch.trim() ? (
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
      ) : null}
      {error ? (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="min-h-9 md:min-h-7"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy || !path.trim()}
          className="min-h-9 md:min-h-7"
        >
          {busy ? "Adding…" : "Add worktree"}
        </Button>
      </div>
    </form>
  );
}

function RemoveWorktreeDialog({
  entry,
  busy,
  error,
  force,
  onForceChange,
  onOpenChange,
  onConfirm,
}: {
  entry: GitWorktreeEntry | null;
  busy: boolean;
  error: string | null;
  force: boolean;
  onForceChange: (force: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const open = entry != null;
  const title = "Remove worktree";
  const description = entry
    ? `Remove ${worktreeLabel(entry)} at ${entry.path}? The directory is deleted when git allows it.`
    : "";

  const body = (
    <>
      <p className="text-[13px] text-muted-foreground">{description}</p>
      <label className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={force}
          onChange={(event) => onForceChange(event.target.checked)}
          disabled={busy}
          className="size-4 accent-primary"
        />
        Force remove (dirty worktree)
      </label>
      {error ? (
        <p className="mt-2 text-[12px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(false)}
        disabled={busy}
        className="min-h-9 md:min-h-7"
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onConfirm}
        disabled={busy}
        className="min-h-9 md:min-h-7"
      >
        {busy ? "Removing…" : "Remove"}
      </Button>
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">
              {description}
            </DialogDescription>
          </DialogHeader>
          {body}
          <DialogFooter className="mt-2">{actions}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {description}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-2">{body}</div>
        <DrawerFooter className="flex-row justify-end gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {actions}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function WorktreeSwitcher({
  project,
  worktrees,
  connected,
  onSelect,
  className,
}: WorktreeSwitcherProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GitWorktreeEntry | null>(
    null,
  );
  const [removeForce, setRemoveForce] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const activePath = projectActiveRoot(project);
  const entries = worktrees.worktrees;
  const current = useMemo(
    () => entries.find((entry) => pathsMatch(entry.path, activePath)) ?? null,
    [activePath, entries],
  );
  const triggerLabel = current
    ? worktreeLabel(current)
    : basename(activePath) || "worktree";

  if (!connected) return null;
  if (!worktrees.loading && entries.length === 0 && !worktrees.error) {
    return null;
  }

  function closeMenus() {
    setDrawerOpen(false);
  }

  function handleSelect(path: string | null) {
    onSelect(path);
    closeMenus();
  }

  async function handleAdd(input: AddWorktreeInput) {
    setAddError(null);
    try {
      const entry = await worktrees.add(input);
      setAddOpen(false);
      onSelect(pathsMatch(entry.path, project.path) ? null : entry.path);
      closeMenus();
    } catch (err) {
      const parsed = err as GitCommandError;
      setAddError(parsed.message || "Failed to add worktree");
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoveError(null);
    try {
      await worktrees.remove(removeTarget.path, removeForce);
      setRemoveTarget(null);
      setRemoveForce(false);
    } catch (err) {
      const parsed = err as GitCommandError;
      setRemoveError(parsed.message || "Failed to remove worktree");
    }
  }

  const list = (
    <WorktreeList
      project={project}
      entries={entries}
      activePath={activePath}
      busy={worktrees.busy}
      onSelect={handleSelect}
      onRemove={(entry) => {
        setRemoveError(null);
        setRemoveForce(false);
        setRemoveTarget(entry);
      }}
      onAdd={() => {
        setAddError(null);
        setAddOpen(true);
      }}
    />
  );

  const triggerClass = cn(
    "h-7 gap-1 px-2 text-[12px] text-muted-foreground hover:text-foreground",
    "max-md:min-h-9 max-md:px-2",
    className,
  );

  const addDialog = isDesktop ? (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add worktree</DialogTitle>
          <DialogDescription>
            Create a linked worktree for this project&apos;s repo.
          </DialogDescription>
        </DialogHeader>
        <AddWorktreeForm
          project={project}
          busy={worktrees.busy}
          error={addError}
          onCancel={() => setAddOpen(false)}
          onSubmit={(input) => void handleAdd(input)}
        />
      </DialogContent>
    </Dialog>
  ) : (
    <Drawer open={addOpen} onOpenChange={setAddOpen} swipeDirection="down">
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Add worktree</DrawerTitle>
          <DrawerDescription>
            Create a linked worktree for this project&apos;s repo.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <AddWorktreeForm
            project={project}
            busy={worktrees.busy}
            error={addError}
            onCancel={() => setAddOpen(false)}
            onSubmit={(input) => void handleAdd(input)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );

  const removeDialog = (
    <RemoveWorktreeDialog
      entry={removeTarget}
      busy={worktrees.busy}
      error={removeError}
      force={removeForce}
      onForceChange={setRemoveForce}
      onOpenChange={(open) => {
        if (!open) {
          setRemoveTarget(null);
          setRemoveForce(false);
          setRemoveError(null);
        }
      }}
      onConfirm={() => void handleRemove()}
    />
  );

  if (isDesktop) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Switch worktree"
                className={triggerClass}
                disabled={worktrees.loading && entries.length === 0}
              />
            }
          >
            <GitBranch className="size-3.5" />
            <span className="max-w-[8rem] truncate font-mono">
              {triggerLabel}
            </span>
            <ChevronDown className="size-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-80 w-auto p-1.5">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Worktrees</DropdownMenuLabel>
              <div
                className="pt-0.5"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {worktrees.error ? (
                  <p className="px-2 py-2 text-[12px] text-destructive">
                    {worktrees.error.message}
                  </p>
                ) : null}
                {list}
              </div>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {addDialog}
        {removeDialog}
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Switch worktree"
        className={triggerClass}
        onClick={() => setDrawerOpen(true)}
        disabled={worktrees.loading && entries.length === 0}
      >
        <GitBranch className="size-3.5" />
        <span className="max-w-[6rem] truncate font-mono">{triggerLabel}</span>
      </Button>
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        swipeDirection="down"
        showSwipeHandle
      >
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Worktrees</DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[min(60dvh,24rem)] overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {worktrees.error ? (
              <p className="px-2 py-2 text-[12px] text-destructive">
                {worktrees.error.message}
              </p>
            ) : null}
            {list}
          </div>
        </DrawerContent>
      </Drawer>
      {addDialog}
      {removeDialog}
    </>
  );
}
