import { cn } from "@/lib/utils";
import type { WorkspaceTab } from "@/lib/types";

const tabs: { id: WorkspaceTab; label: string; shortcut: string }[] = [
  { id: "terminal", label: "Terminal", shortcut: "1" },
  { id: "sftp", label: "SFTP", shortcut: "2" },
  { id: "forwards", label: "Forwards", shortcut: "3" },
];

type WorkspaceTabsProps = {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
};

export function WorkspaceTabs({ active, onChange }: WorkspaceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Session workspace"
      className="flex shrink-0 border-b border-border px-1 md:gap-0.5 md:px-2"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative min-h-11 flex-1 px-2 py-2.5 text-[12px] font-medium transition-colors duration-150 ease-out md:min-h-0 md:flex-none md:px-3",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span className="sr-only">, shortcut {tab.shortcut}</span>
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-opacity duration-150 ease-out md:inset-x-2",
                selected ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
