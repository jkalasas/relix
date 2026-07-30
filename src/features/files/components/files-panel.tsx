import { useCallback, useRef, useState } from "react";
import {
  ChevronUp,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDeleteDialog } from "@/features/files/components/file-delete-dialog";
import {
  FileEntryMenu,
  type FileEntryAction,
  type FileEntryMenuState,
} from "@/features/files/components/file-entry-menu";
import { FileTypeIcon } from "@/features/files/file-icon";
import { formatBytes, parentPath } from "@/features/files/format";
import { useFiles, type FilesController } from "@/features/files/use-files";
import { isLocalHost, type Host } from "@/features/hosts";
import type { FsEntry } from "@/features/ssh";
import { useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/utils";

type FilesPanelProps = {
  host: Host;
  files?: FilesController;
  embedded?: boolean;
  shellCwd?: string | null;
  tmuxSession?: string | null;
  tmuxWindowId?: string | null;
  onConnect: () => void;
  onOpenFile: (entry: FsEntry) => void;
};

function FsEntryRow({
  entry,
  renaming,
  renameValue,
  busy,
  onOpen,
  onMenu,
  onRenameValue,
  onRenameCommit,
  onRenameCancel,
}: {
  entry: FsEntry;
  renaming: boolean;
  renameValue: string;
  busy: boolean;
  onOpen: () => void;
  onMenu: (point: { x: number; y: number }) => void;
  onRenameValue: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}) {
  const longPress = useLongPress(onMenu, !renaming);

  return (
    <li
      className="flex min-h-11 items-center gap-2 border-b border-border/60 px-3 py-1.5 sm:px-4 md:min-h-9"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!renaming) onMenu({ x: event.clientX, y: event.clientY });
      }}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
    >
      {renaming ? (
        <>
          <FileTypeIcon name={entry.name} isDir={entry.isDir} />
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
            className="min-w-0 flex-1 rounded-sm bg-background px-1.5 py-1 font-mono text-[13px] text-foreground outline-none ring-1 ring-ring"
          />
        </>
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          disabled={busy}
          onClick={() => {
            if (longPress.suppressClick()) return;
            onOpen();
          }}
        >
          <FileTypeIcon name={entry.name} isDir={entry.isDir} />
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
            {entry.name}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {entry.isDir ? "dir" : formatBytes(entry.size)}
          </span>
        </button>
      )}
    </li>
  );
}

export function FilesPanel({
  host,
  files: filesProp,
  embedded = false,
  shellCwd,
  tmuxSession,
  tmuxWindowId,
  onConnect,
  onOpenFile,
}: FilesPanelProps) {
  const local = isLocalHost(host);
  const connected = host.status === "connected";
  const ownedFiles = useFiles({
    hostId: host.id,
    connected,
    enabled: !filesProp,
    shellCwd: filesProp ? undefined : shellCwd,
    tmuxSession: filesProp || local ? undefined : tmuxSession,
    tmuxWindowId: filesProp || local ? undefined : tmuxWindowId,
  });
  const files = filesProp ?? ownedFiles;
  const upPath = parentPath(files.path);
  const pathLabel = local
    ? files.path
    : `${host.user}@${host.hostname}:${files.path}`;

  const [menu, setMenu] = useState<FileEntryMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FsEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameOriginalRef = useRef("");

  const openEntry = useCallback(
    (entry: FsEntry) => {
      if (entry.isDir) {
        files.openDir(entry.path);
        return;
      }
      onOpenFile(entry);
    },
    [onOpenFile, files],
  );

  const beginRename = useCallback((entry: FsEntry) => {
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
    renameOriginalRef.current = entry.name;
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingPath) return;
    const entry =
      files.findEntry?.(renamingPath) ??
      files.entries.find((item) => item.path === renamingPath) ??
      null;
    const next = renameValue.trim();
    setRenamingPath(null);
    if (!entry || !next || next === renameOriginalRef.current) return;
    try {
      await files.renameEntry(entry, next);
    } catch {
      // error surfaced via files.error
    }
  }, [renameValue, renamingPath, files]);

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenameValue("");
  }, []);

  const onEntryAction = useCallback(
    (action: FileEntryAction, entry: FsEntry) => {
      switch (action) {
        case "view":
        case "open":
          openEntry(entry);
          break;
        case "rename":
          beginRename(entry);
          break;
        case "download":
          void files.downloadEntry(entry);
          break;
        case "delete":
          setDeleteTarget(entry);
          break;
      }
    },
    [beginRename, openEntry, files],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await files.removeEntry(deleteTarget);
      setDeleteTarget(null);
    } catch {
      // keep dialog open; error on panel
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, files]);

  if (!connected) {
    return (
      <div
        role={embedded ? undefined : "tabpanel"}
        id={embedded ? undefined : "session-panel-files"}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
          <FolderOpen className="size-5" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h3 className="text-sm font-medium text-balance">Files unavailable</h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            Connect to {host.name} before browsing or transferring files.
          </p>
        </div>
        <Button type="button" size="sm" onClick={onConnect}>
          Connect
        </Button>
      </div>
    );
  }

  return (
    <div
      role={embedded ? undefined : "tabpanel"}
      id={embedded ? undefined : "session-panel-files"}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4 md:min-h-10">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => upPath && files.openDir(upPath)}
          disabled={!upPath || files.loading}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="Parent directory"
        >
          <ChevronUp className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {pathLabel}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void files.refresh()}
          disabled={files.loading}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-4", files.loading && "animate-spin")} />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void files.mkdir()}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="New directory"
        >
          <FolderPlus className="size-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void files.uploadFile()}
          disabled={files.transfer?.busy}
          className="min-h-9 shrink-0 md:min-h-7"
        >
          <Upload data-icon="inline-start" />
          Upload
        </Button>
      </div>

      {files.error ? (
        <p
          className="border-b border-border bg-surface px-4 py-2 text-[13px] text-destructive"
          role="alert"
        >
          {files.error}
        </p>
      ) : null}

      {files.transfer ? (
        <div
          className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2"
          role="status"
          aria-live="polite"
        >
          <p className="min-w-0 truncate text-[13px]">
            <span className="text-status-transfer">
              {files.transfer.busy
                ? files.transfer.kind === "upload"
                  ? "Uploading"
                  : "Downloading"
                : files.transfer.error
                  ? "Transfer failed"
                  : files.transfer.kind === "upload"
                    ? "Uploaded"
                    : "Downloaded"}
            </span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-mono text-foreground">{files.transfer.name}</span>
            {files.transfer.error ? (
              <span className="text-destructive"> — {files.transfer.error}</span>
            ) : null}
          </p>
          {!files.transfer.busy ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={files.clearTransfer}
              className="min-h-9 shrink-0 md:min-h-7"
            >
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {files.loading && files.entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            Listing…
          </p>
        ) : files.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <FolderOpen className="size-5 text-status-transfer" aria-hidden />
            <p className="text-sm font-medium">Empty directory</p>
            <p className="text-[13px] text-muted-foreground">
              Upload a file or create a directory.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col" aria-label={local ? "Local files" : "Remote files"}>
            {files.entries.map((entry) => (
              <FsEntryRow
                key={entry.path}
                entry={entry}
                renaming={renamingPath === entry.path}
                renameValue={renameValue}
                busy={Boolean(files.transfer?.busy)}
                onOpen={() => openEntry(entry)}
                onMenu={(point) => setMenu({ entry, ...point })}
                onRenameValue={setRenameValue}
                onRenameCommit={() => void commitRename()}
                onRenameCancel={cancelRename}
              />
            ))}
          </ul>
        )}
      </div>

      <FileEntryMenu
        menu={menu}
        busy={Boolean(files.transfer?.busy) || deleteBusy}
        onClose={() => setMenu(null)}
        onAction={onEntryAction}
      />
      <FileDeleteDialog
        entry={deleteTarget}
        busy={deleteBusy}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
