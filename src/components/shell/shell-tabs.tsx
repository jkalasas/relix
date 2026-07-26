import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShellSession } from "@/lib/types";

type ShellTabsProps = {
  sessions: ShellSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
};

export function ShellTabs({
  sessions,
  activeId,
  onSelect,
  onClose,
  onNew,
}: ShellTabsProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2">
      {sessions.map((session) => {
        const active = session.id === activeId;
        return (
          <div
            key={session.id}
            className={cn(
              "flex h-7 items-center gap-1 rounded-md px-2 font-mono text-[12px]",
              active
                ? "bg-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(session.id)}
              className="max-w-[9rem] truncate"
            >
              {session.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${session.title}`}
              onClick={() => onClose(session.id)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="New shell"
        onClick={onNew}
        className="size-7"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}
