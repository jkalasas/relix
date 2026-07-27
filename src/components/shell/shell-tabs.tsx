import type { ComponentType } from "react";
import {
  Bot,
  Code2,
  Plus,
  Sparkles,
  TerminalSquare,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  shellLaunchById,
  type ShellLaunchId,
} from "@/lib/shell-launch";
import { cn } from "@/lib/utils";
import type { ShellSession } from "@/lib/types";

const LAUNCH_ICONS: Record<
  ShellLaunchId,
  ComponentType<{ className?: string }>
> = {
  shell: TerminalSquare,
  claude: Sparkles,
  opencode: Code2,
  pi: Bot,
};

type ShellTabsProps = {
  sessions: ShellSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (launchId?: ShellLaunchId) => void;
};

function LaunchItem({
  id,
  onSelect,
}: {
  id: ShellLaunchId;
  onSelect: (launchId: ShellLaunchId) => void;
}) {
  const launch = shellLaunchById(id);
  const Icon = LAUNCH_ICONS[id];
  return (
    <DropdownMenuItem
      onClick={() => onSelect(id)}
      className="gap-2 py-1.5"
    >
      <Icon className="size-3.5 text-muted-foreground" />
      <span>{launch.label}</span>
    </DropdownMenuItem>
  );
}

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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="New session"
              className="size-7"
            />
          }
        >
          <Plus className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="min-w-44 w-auto">
          <LaunchItem id="shell" onSelect={onNew} />
          <DropdownMenuSeparator />
          <LaunchItem id="claude" onSelect={onNew} />
          <LaunchItem id="opencode" onSelect={onNew} />
          <LaunchItem id="pi" onSelect={onNew} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
