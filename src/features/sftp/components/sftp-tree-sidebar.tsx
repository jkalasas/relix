import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderPlus,
  RefreshCw,
  Server,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SftpDeleteDialog } from "@/features/sftp/components/sftp-delete-dialog";
import {
  SftpEntryMenu,
  type SftpEntryAction,
  type SftpEntryMenuState,
} from "@/features/sftp/components/sftp-entry-menu";
import { FileTypeIcon } from "@/features/sftp/file-icon";
import { basename, parentPath } from "@/features/sftp/format";
import type { SftpController } from "@/features/sftp/use-sftp";
import type { SftpEntry } from "@/features/ssh";
import { cn } from "@/lib/utils";

type SftpTreeSidebarProps = {
  sftp: SftpController;
  rootLabel: string;
  selectedPath?: string | null;
  onOpenFile: (entry: SftpEntry) => void;
  onShowHosts?: () => void;
  className?: string;
};

type TreeNodeProps = {
  entry: SftpEntry;
  depth: number;
  sftp: SftpController;
  selectedPath?: string | null;
  renamingPath: string | null;
  renameValue: string;
  busy: boolean;
  onOpen: (entry: SftpEntry) => void;
  onMenu: (entry: SftpEntry, point: { x: number; y: number }) => void;
  onRenameValue: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
};

function TreeNode({
  entry,
  depth,
  sftp,
  selectedPath,
  renamingPath,
  renameValue,
  busy,
  onOpen,
  onMenu,
  onRenameValue,
  onRenameCommit,
  onRenameCancel,
}: TreeNodeProps) {
  const expanded = Boolean(sftp.expandedPaths[entry.path]);
  const loading = Boolean(sftp.loadingPaths[entry.path]);
  const children = sftp.childrenByPath[entry.path] ?? [];
  const selected = selectedPath === entry.path;
  const renaming = renamingPath === entry.path;
  const paddingLeft = 8 + depth * 12;

  return (
    <li>
      <div
        className={cn(
          "group flex h-7 items-center gap-0.5 pr-2 text-[12.5px]",
          selected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
        style={{ paddingLeft }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!renaming) onMenu(entry, { x: event.clientX, y: event.clientY });
        }}
      >
        {entry.isDir ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
            disabled={busy}
            onClick={() => void sftp.toggleDir(entry.path)}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}

        {renaming ? (
          <>
            <FileTypeIcon
              name={entry.name}
              isDir={entry.isDir}
              open={expanded}
              className="mr-1"
            />
            <input
              autoFocus
              value={renameValue}
              aria-label={`Rename ${entry.name}`}
              onChange={(event) => onRenameValue(event.target.value)}
              onBlur={() => onRenameCommit()}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onRenameCommit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onRenameCancel();
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="min-w-0 flex-1 rounded-sm bg-background px-1 py-0.5 font-mono text-[12px] text-foreground outline-none ring-1 ring-ring"
            />
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpen(entry)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title={entry.path}
          >
            <FileTypeIcon
              name={entry.name}
              isDir={entry.isDir}
              open={expanded}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
              {entry.name}
            </span>
            {loading ? (
              <RefreshCw
                className="size-3 shrink-0 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </button>
        )}
      </div>

      {entry.isDir && expanded ? (
        <ul className="flex flex-col" role="group">
          {children.length === 0 && !loading ? (
            <li
              className="h-7 px-2 font-mono text-[11px] leading-7 text-muted-foreground/80"
              style={{ paddingLeft: paddingLeft + 20 }}
            >
              empty
            </li>
          ) : (
            children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                sftp={sftp}
                selectedPath={selectedPath}
                renamingPath={renamingPath}
                renameValue={renameValue}
                busy={busy}
                onOpen={onOpen}
                onMenu={onMenu}
                onRenameValue={onRenameValue}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
              />
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}

export function SftpTreeSidebar({
  sftp,
  rootLabel,
  selectedPath = null,
  onOpenFile,
  onShowHosts,
  className,
}: SftpTreeSidebarProps) {
  const upPath = parentPath(sftp.path);
  const rootName = useMemo(() => {
    const name = basename(sftp.path);
    if (!name || name === "." || name === "/" || name === "\\") return rootLabel;
    return name;
  }, [rootLabel, sftp.path]);

  const [menu, setMenu] = useState<SftpEntryMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SftpEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameOriginalRef = useRef("");

  const rootEntries = sftp.childrenByPath[sftp.path] ?? sftp.entries;
  const busy = Boolean(sftp.transfer?.busy);

  const openEntry = useCallback(
    (entry: SftpEntry) => {
      if (entry.isDir) {
        void sftp.toggleDir(entry.path);
        return;
      }
      onOpenFile(entry);
    },
    [onOpenFile, sftp],
  );

  const beginRename = useCallback((entry: SftpEntry) => {
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
    renameOriginalRef.current = entry.name;
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingPath) return;
    const entry = sftp.findEntry(renamingPath);
    const next = renameValue.trim();
    setRenamingPath(null);
    if (!entry || !next || next === renameOriginalRef.current) return;
    try {
      await sftp.renameEntry(entry, next);
    } catch {
      // error surfaced via sftp.error
    }
  }, [renameValue, renamingPath, sftp]);

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenameValue("");
  }, []);

  const onEntryAction = useCallback(
    (action: SftpEntryAction, entry: SftpEntry) => {
      switch (action) {
        case "view":
        case "open":
          openEntry(entry);
          break;
        case "rename":
          beginRename(entry);
          break;
        case "download":
          void sftp.downloadEntry(entry);
          break;
        case "delete":
          setDeleteTarget(entry);
          break;
      }
    },
    [beginRename, openEntry, sftp],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await sftp.removeEntry(deleteTarget);
      setDeleteTarget(null);
    } catch {
      // keep dialog open
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, sftp]);

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col bg-sidebar text-sidebar-foreground",
        "w-full md:w-60 md:shrink-0 md:border-r md:border-sidebar-border",
        className,
      )}
    >
      <div className="shrink-0 border-b border-sidebar-border">
        <div className="flex h-12 items-center gap-2 px-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Server className="size-3.5" aria-hidden />
          </div>
          <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
            Relix
          </span>
          {onShowHosts ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onShowHosts}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Hosts
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1 px-2 pb-1 pt-2">
        <p
          className="min-w-0 flex-1 truncate px-1 font-mono text-[12px] font-medium text-foreground"
          title={sftp.path}
        >
          {rootName}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => upPath && sftp.openDir(upPath)}
          disabled={!upPath || sftp.loading}
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Parent directory"
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => sftp.refreshTree()}
          disabled={sftp.loading}
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Refresh"
        >
          <RefreshCw
            className={cn("size-3.5", sftp.loading && "animate-spin")}
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void sftp.mkdir()}
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="New directory"
        >
          <FolderPlus className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void sftp.uploadFile()}
          disabled={busy}
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Upload file"
        >
          <Upload className="size-3.5" />
        </Button>
      </div>

      {sftp.error ? (
        <p
          className="border-b border-sidebar-border bg-surface px-3 py-1.5 text-[12px] text-destructive"
          role="alert"
        >
          {sftp.error}
        </p>
      ) : null}

      {sftp.transfer ? (
        <div
          className="flex items-center justify-between gap-2 border-b border-sidebar-border bg-surface px-3 py-1.5"
          role="status"
          aria-live="polite"
        >
          <p className="min-w-0 truncate text-[12px]">
            <span className="text-status-transfer">
              {sftp.transfer.busy
                ? sftp.transfer.kind === "upload"
                  ? "Uploading"
                  : "Downloading"
                : sftp.transfer.error
                  ? "Failed"
                  : sftp.transfer.kind === "upload"
                    ? "Uploaded"
                    : "Downloaded"}
            </span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-mono text-foreground">
              {sftp.transfer.name}
            </span>
          </p>
          {!sftp.transfer.busy ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={sftp.clearTransfer}
              className="h-6 shrink-0 px-1.5 text-[11px]"
            >
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {sftp.loading && rootEntries.length === 0 ? (
          <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            Listing…
          </p>
        ) : rootEntries.length === 0 ? (
          <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            Empty directory
          </p>
        ) : (
          <ul className="flex flex-col" aria-label="File tree">
            {rootEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                sftp={sftp}
                selectedPath={selectedPath}
                renamingPath={renamingPath}
                renameValue={renameValue}
                busy={busy || deleteBusy}
                onOpen={openEntry}
                onMenu={(item, point) => setMenu({ entry: item, ...point })}
                onRenameValue={setRenameValue}
                onRenameCommit={() => void commitRename()}
                onRenameCancel={cancelRename}
              />
            ))}
          </ul>
        )}
      </div>

      <SftpEntryMenu
        menu={menu}
        busy={busy || deleteBusy}
        onClose={() => setMenu(null)}
        onAction={onEntryAction}
      />
      <SftpDeleteDialog
        entry={deleteTarget}
        busy={deleteBusy}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </aside>
  );
}
