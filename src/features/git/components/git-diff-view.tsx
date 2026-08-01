import { useMemo } from "react";
import { ChevronLeft, FileDiff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/empty-state";
import type { GitDiffSelection } from "@/features/git/hooks/use-git";
import type { GitCommandError, GitDiffResult } from "@/features/git/types";
import { cn } from "@/lib/utils";

type DiffLineKind = "add" | "del" | "hunk" | "meta" | "context";

type DiffLine = {
  key: string;
  kind: DiffLineKind;
  text: string;
};

type GitDiffViewProps = {
  selection: GitDiffSelection;
  loading: boolean;
  error: GitCommandError | null;
  result: GitDiffResult | null;
  onBack: () => void;
};

const META_PREFIXES = [
  "diff ",
  "index ",
  "---",
  "+++",
  "new file",
  "deleted file",
  "old mode",
  "new mode",
  "similarity index",
  "rename from",
  "rename to",
  "copy from",
  "copy to",
  "Binary files",
] as const;

function classifyLine(line: string): DiffLineKind {
  if (META_PREFIXES.some((prefix) => line.startsWith(prefix))) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

function parseDiffLines(diffText: string): DiffLine[] {
  if (!diffText) return [];
  const raw = diffText.replace(/\n$/, "").split("\n");
  return raw.map((text, index) => ({
    key: `${index}:${text.slice(0, 24)}`,
    kind: classifyLine(text),
    text: text.length === 0 ? " " : text,
  }));
}

function lineClass(kind: DiffLineKind): string {
  switch (kind) {
    case "add":
      return "text-status-connected";
    case "del":
      return "text-destructive";
    case "hunk":
    case "meta":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

function selectionLabel(selection: GitDiffSelection): string {
  if (selection.path == null) {
    return selection.staged ? "All staged" : "All changes";
  }
  if (selection.originalPath) {
    return `${selection.originalPath} → ${selection.path}`;
  }
  return selection.path;
}

function emptyTitle(isUntracked: boolean): string {
  return isUntracked ? "Untracked file" : "No textual changes";
}

function emptyDescription(
  selection: GitDiffSelection,
  isUntracked: boolean,
): string {
  if (isUntracked) {
    return "No baseline yet. Stage the file to preview its addition.";
  }
  if (selection.path == null && !selection.staged) {
    return "No tracked working-tree patch. Untracked files are not included.";
  }
  if (selection.path == null) {
    return "Git reported no staged patch.";
  }
  return "Git reported no patch for this path.";
}

export function GitDiffView({
  selection,
  loading,
  error,
  result,
  onBack,
}: GitDiffViewProps) {
  const pathLabel = selectionLabel(selection);
  const scopeLabel = selection.staged ? "Staged" : "Working tree";
  const lines = useMemo(
    () => parseDiffLines(result?.diffText ?? ""),
    [result?.diffText],
  );
  const isUntracked = selection.untracked && !selection.staged;
  const showEmpty =
    !loading &&
    !error &&
    (isUntracked || (result != null && lines.length === 0));
  const ariaLabel =
    selection.path == null
      ? selection.staged
        ? "Diff for all staged changes"
        : "Diff for all working tree changes"
      : `Diff for ${selection.path}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-3 md:h-10 md:min-h-0">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          className="size-9 shrink-0 text-muted-foreground hover:text-foreground md:size-7"
          aria-label="Back to changes"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex flex-1 items-center gap-2">
          <span className="min-w-0 truncate font-mono text-[12.5px] text-foreground md:text-xs">
            {pathLabel}
          </span>
          {selection.path != null ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {scopeLabel}
            </span>
          ) : null}
          {result?.truncated ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              truncated
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading diff…
        </div>
      ) : error ? (
        <p
          className="shrink-0 border-b border-border px-3 py-2 text-[12px] text-destructive sm:px-4"
          role="alert"
        >
          {error.message}
        </p>
      ) : null}

      {showEmpty ? (
        <EmptyState
          icon={FileDiff}
          title={emptyTitle(isUntracked)}
          description={emptyDescription(selection, isUntracked)}
        />
      ) : !loading && !error && lines.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <pre
            className="min-w-full p-3 font-mono text-[12.5px] leading-5 md:text-xs sm:px-4"
            aria-label={ariaLabel}
          >
            {lines.map((line) => (
              <div
                key={line.key}
                className={cn("whitespace-pre", lineClass(line.kind))}
              >
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
