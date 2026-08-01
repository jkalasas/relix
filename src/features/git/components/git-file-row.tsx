import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GitChangedFile } from "@/features/git/types";
import { cn } from "@/lib/utils";

export type GitFileRowMode = "staged" | "changes";

type GitFileRowProps = {
  file: GitChangedFile;
  mode: GitFileRowMode;
  busy: boolean;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
};

function statusCode(file: GitChangedFile, mode: GitFileRowMode): string {
  if (file.untracked) return "?";
  if (mode === "staged") {
    const code = file.indexStatus.trim();
    return code || "M";
  }
  const code = file.worktreeStatus.trim();
  return code || "M";
}

export function GitFileRow({
  file,
  mode,
  busy,
  onStage,
  onUnstage,
  onDiscard,
}: GitFileRowProps) {
  const pathLabel = file.originalPath
    ? `${file.originalPath} → ${file.path}`
    : file.path;
  const code = statusCode(file, mode);

  return (
    <li className="flex min-h-11 items-center gap-2 border-b border-border/60 px-3 py-1 sm:px-4 md:min-h-9">
      <span
        className={cn(
          "w-4 shrink-0 text-center font-mono text-[11px] font-medium tabular-nums",
          code === "?" || code === "A"
            ? "text-foreground"
            : code === "D"
              ? "text-destructive"
              : "text-muted-foreground",
        )}
        title={file.statusLabel}
      >
        {code}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground md:text-xs">
        {pathLabel}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {mode === "changes" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onStage}
            disabled={busy}
            className="size-9 text-muted-foreground hover:text-foreground md:size-7"
            aria-label={`Stage ${file.path}`}
          >
            <Plus className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onUnstage}
            disabled={busy}
            className="size-9 text-muted-foreground hover:text-foreground md:size-7"
            aria-label={`Unstage ${file.path}`}
          >
            <Minus className="size-3.5" />
          </Button>
        )}
        {mode === "changes" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDiscard}
            disabled={busy}
            className="size-9 text-muted-foreground hover:text-destructive md:size-7"
            aria-label={`Discard ${file.path}`}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
