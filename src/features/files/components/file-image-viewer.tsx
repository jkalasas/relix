import { useEffect, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mimeForImage } from "@/features/files/file-kind";

type FileImageViewerProps = {
  path: string;
  name: string;
  bytes: Uint8Array;
  onBack: () => void;
};

export function FileImageViewer({
  path,
  name,
  bytes,
  onBack,
}: FileImageViewerProps) {
  const url = useMemo(() => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: mimeForImage(name) });
    return URL.createObjectURL(blob);
  }, [bytes, name]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <img
          src={url}
          alt={name}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
