import {
  ChevronUp,
  Download,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, parentPath } from "@/features/sftp/format";
import { useSftp } from "@/features/sftp/use-sftp";
import type { Host } from "@/features/hosts/types";
import { cn } from "@/lib/utils";

type SftpPanelProps = {
  host: Host;
  shellCwd?: string | null;
  tmuxSession?: string | null;
  tmuxWindowId?: string | null;
  onConnect: () => void;
};

export function SftpPanel({
  host,
  shellCwd,
  tmuxSession,
  tmuxWindowId,
  onConnect,
}: SftpPanelProps) {
  const connected = host.status === "connected";
  const sftp = useSftp({
    hostId: host.id,
    connected,
    shellCwd,
    tmuxSession,
    tmuxWindowId,
  });
  const upPath = parentPath(sftp.path);

  if (!connected) {
    return (
      <div
        role="tabpanel"
        id="panel-sftp"
        aria-labelledby="tab-sftp"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
          <FolderOpen className="size-5" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h3 className="text-sm font-medium text-balance">SFTP unavailable</h3>
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
      role="tabpanel"
      id="panel-sftp"
      aria-labelledby="tab-sftp"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4 md:min-h-10">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => upPath && sftp.openDir(upPath)}
          disabled={!upPath || sftp.loading}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="Parent directory"
        >
          <ChevronUp className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {host.user}@{host.hostname}:{sftp.path}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void sftp.refresh()}
          disabled={sftp.loading}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-4", sftp.loading && "animate-spin")} />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void sftp.mkdir()}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="New directory"
        >
          <FolderPlus className="size-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void sftp.uploadFile()}
          disabled={sftp.transfer?.busy}
          className="min-h-9 shrink-0 md:min-h-7"
        >
          <Upload data-icon="inline-start" />
          Upload
        </Button>
      </div>

      {sftp.error ? (
        <p
          className="border-b border-border bg-surface px-4 py-2 text-[13px] text-destructive"
          role="alert"
        >
          {sftp.error}
        </p>
      ) : null}

      {sftp.transfer ? (
        <div
          className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2"
          role="status"
          aria-live="polite"
        >
          <p className="min-w-0 truncate text-[13px]">
            <span className="text-status-transfer">
              {sftp.transfer.busy
                ? sftp.transfer.kind === "upload"
                  ? "Uploading"
                  : "Downloading"
                : sftp.transfer.error
                  ? "Transfer failed"
                  : sftp.transfer.kind === "upload"
                    ? "Uploaded"
                    : "Downloaded"}
            </span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-mono text-foreground">{sftp.transfer.name}</span>
            {sftp.transfer.error ? (
              <span className="text-destructive"> — {sftp.transfer.error}</span>
            ) : null}
          </p>
          {!sftp.transfer.busy ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={sftp.clearTransfer}
              className="min-h-9 shrink-0 md:min-h-7"
            >
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {sftp.loading && sftp.entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            Listing…
          </p>
        ) : sftp.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <FolderOpen className="size-5 text-status-transfer" aria-hidden />
            <p className="text-sm font-medium">Empty directory</p>
            <p className="text-[13px] text-muted-foreground">
              Upload a file or create a directory.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col" aria-label="Remote files">
            {sftp.entries.map((entry) => (
              <li
                key={entry.path}
                className="flex min-h-11 items-center gap-2 border-b border-border/60 px-3 py-1.5 sm:px-4 md:min-h-9"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => {
                    if (entry.isDir) sftp.openDir(entry.path);
                    else void sftp.downloadEntry(entry);
                  }}
                >
                  {entry.isDir ? (
                    <Folder
                      className="size-4 shrink-0 text-status-transfer"
                      aria-hidden
                    />
                  ) : (
                    <File
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                    {entry.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {entry.isDir ? "dir" : formatBytes(entry.size)}
                  </span>
                </button>
                {!entry.isDir ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-9 shrink-0 md:min-h-7"
                    aria-label={`Download ${entry.name}`}
                    onClick={() => void sftp.downloadEntry(entry)}
                    disabled={sftp.transfer?.busy}
                  >
                    <Download className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-9 shrink-0 md:min-h-7"
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => void sftp.removeEntry(entry)}
                  disabled={sftp.transfer?.busy}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
