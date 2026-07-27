import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type SftpPdfViewerProps = {
  path: string;
  name: string;
  bytes: Uint8Array;
  onBack: () => void;
};

export function SftpPdfViewer({
  path,
  name,
  bytes,
  onBack,
}: SftpPdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const data = useMemo(() => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy;
  }, [bytes]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setPage(1);
      setPageCount(0);
      try {
        const task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        if (cancelled) {
          void doc.cleanup();
          return;
        }
        docRef.current = doc;
        setPageCount(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to open PDF");
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      const doc = docRef.current;
      docRef.current = null;
      void doc?.cleanup();
    };
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    const doc = docRef.current;
    if (!doc || pageCount === 0) return;

    async function renderPage() {
      if (!doc) return;
      setLoading(true);
      setError(null);
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewport = pdfPage.getViewport({ scale: 1.25 });
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({
          canvasContext: context,
          viewport,
          canvas,
        }).promise;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render page");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [page, pageCount, data]);

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
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9 md:min-h-7"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center font-mono text-[11px] text-muted-foreground">
            {pageCount > 0 ? `${page}/${pageCount}` : "—"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9 md:min-h-7"
            disabled={pageCount === 0 || page >= pageCount || loading}
            onClick={() =>
              setPage((current) => Math.min(pageCount, current + 1))
            }
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {error ? (
        <p
          className="border-b border-border bg-surface px-4 py-2 text-[13px] text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {loading && pageCount === 0 ? (
          <p className="self-center text-[13px] text-muted-foreground">
            Loading {name}…
          </p>
        ) : (
          <canvas ref={canvasRef} className="max-w-full bg-white shadow-sm" />
        )}
      </div>
    </div>
  );
}
