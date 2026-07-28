import { ChevronLeft, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

type FileBinaryViewProps = {
  path: string;
  name: string;
  message: string;
  onBack: () => void;
  onDownload: () => void;
};

export function FileBinaryView({
  path,
  name,
  message,
  onBack,
  onDownload,
}: FileBinaryViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4 md:min-h-10">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onBack}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="Back to files"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {path}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
          <FileWarning className="size-5" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h3 className="text-sm font-medium text-balance">{name}</h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {message}
          </p>
        </div>
        <Button type="button" size="sm" onClick={onDownload}>
          Download
        </Button>
      </div>
    </div>
  );
}
