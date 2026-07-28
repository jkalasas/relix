import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

type WindowControlsProps = {
  className?: string;
};

async function withWindow(
  action: (win: ReturnType<typeof getCurrentWindow>) => Promise<void>,
) {
  if (!isTauri()) return;
  try {
    await action(getCurrentWindow());
  } catch {
    // unsupported host
  }
}

export function WindowControls({ className }: WindowControlsProps) {
  const minimize = useCallback(() => {
    void withWindow((win) => win.minimize());
  }, []);

  const toggleMaximize = useCallback(() => {
    void withWindow((win) => win.toggleMaximize());
  }, []);

  const close = useCallback(() => {
    void withWindow((win) => win.close());
  }, []);

  return (
    <div
      className={cn(
        "flex h-full w-[8.25rem] shrink-0 items-stretch",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Minimize"
        onClick={minimize}
        className="flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Minus className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        onClick={toggleMaximize}
        className="flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Square className="size-3" />
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/90 hover:text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
