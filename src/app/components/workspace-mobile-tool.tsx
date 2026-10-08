import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilesPanel, type FilesController } from "@/features/files";
import { ForwardsPanel, type PortForward } from "@/features/forwards";
import { GitPanel, type GitController } from "@/features/git";
import type { Host } from "@/features/hosts";
import type { SidePanelTab } from "@/app/hooks/use-workspace";
import type { FsEntry } from "@/features/ssh";

type WorkspaceMobileToolProps = {
  host: Host;
  tool: SidePanelTab | null;
  show: boolean;
  files: FilesController;
  git: GitController;
  forwards: PortForward[];
  showPorts: boolean;
  onClose: () => void;
  onConnect: () => void;
  onOpenFile: (entry: FsEntry) => void;
  onAddForward: () => void;
  onStartForward: (id: string) => void;
  onStopForward: (id: string) => void;
  onEditForward: (id: string) => void;
  onDeleteForward: (id: string) => void;
};

const TITLES: Record<SidePanelTab, string> = {
  files: "Files",
  git: "Git",
  ports: "Ports",
};

/**
 * Mobile full-screen tool page: the small-screen counterpart of the
 * desktop right panel. Rendered only below md; Back/Esc closes it.
 */
export function WorkspaceMobileTool({
  host,
  tool,
  show,
  files,
  git,
  forwards,
  showPorts,
  onClose,
  onConnect,
  onOpenFile,
  onAddForward,
  onStartForward,
  onStopForward,
  onEditForward,
  onDeleteForward,
}: WorkspaceMobileToolProps) {
  if (!show || !tool) return null;
  const effectiveTool = tool === "ports" && !showPorts ? "files" : tool;
  return (
    <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-background md:hidden">
      <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border px-1.5 pt-[env(safe-area-inset-top)]">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Back to terminal"
          onClick={onClose}
          className="size-9 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {TITLES[effectiveTool]} · {host.name}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {effectiveTool === "files" ? (
          <FilesPanel
            host={host}
            files={files}
            onConnect={onConnect}
            onOpenFile={(entry) => {
              onOpenFile(entry);
              onClose();
            }}
          />
        ) : null}
        {effectiveTool === "git" ? (
          <GitPanel host={host} git={git} onConnect={onConnect} />
        ) : null}
        {effectiveTool === "ports" && showPorts ? (
          <ForwardsPanel
            host={host}
            forwards={forwards}
            onConnect={onConnect}
            onAddForward={onAddForward}
            onStartForward={onStartForward}
            onStopForward={onStopForward}
            onEditForward={onEditForward}
            onDeleteForward={onDeleteForward}
          />
        ) : null}
      </div>
    </div>
  );
}
