import type { ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/empty-state";
import { SftpPanel } from "@/features/sftp/components/sftp-panel";
import type { SftpController } from "@/features/sftp/use-sftp";
import type { Host } from "@/features/hosts/types";
import type { SftpEntry } from "@/features/ssh";
import { cn } from "@/lib/utils";

type SftpWorkspaceProps = {
  host: Host;
  sftp: SftpController;
  activeKind: "files" | "file";
  onConnect: () => void;
  onOpenFile: (entry: SftpEntry) => void;
  fileSlot?: ReactNode;
  className?: string;
};

function EmptyFilesPane({ hostName }: { hostName: string }) {
  return (
    <EmptyState
      icon={FolderOpen}
      title="Select a file"
      description={`Open a file from the tree to edit or preview on ${hostName}.`}
      className="gap-3"
    />
  );
}

function DisconnectedPane({
  hostName,
  onConnect,
}: {
  hostName: string;
  onConnect: () => void;
}) {
  return (
    <EmptyState
      icon={FolderOpen}
      title="Files unavailable"
      description={`Connect to ${hostName} before browsing or transferring files.`}
      action={
        <Button type="button" size="sm" onClick={onConnect}>
          Connect
        </Button>
      }
    />
  );
}

export function SftpWorkspace({
  host,
  sftp,
  activeKind,
  onConnect,
  onOpenFile,
  fileSlot,
  className,
}: SftpWorkspaceProps) {
  const connected = host.status === "connected";

  if (!connected) {
    return (
      <div
        role="tabpanel"
        id="session-panel-files"
        className={cn("flex min-h-0 flex-1 flex-col", className)}
      >
        <DisconnectedPane hostName={host.name} onConnect={onConnect} />
      </div>
    );
  }

  return (
    <div
      role={activeKind === "files" ? "tabpanel" : undefined}
      id={activeKind === "files" ? "session-panel-files" : undefined}
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      <div
        className={
          activeKind === "files"
            ? "flex min-h-0 flex-1 flex-col md:hidden"
            : "hidden"
        }
      >
        <SftpPanel
          host={host}
          sftp={sftp}
          onConnect={onConnect}
          onOpenFile={onOpenFile}
          embedded
        />
      </div>

      <div
        className={
          activeKind === "files"
            ? "hidden min-h-0 flex-1 flex-col md:flex"
            : "hidden"
        }
      >
        <EmptyFilesPane hostName={host.name} />
      </div>

      <div
        className={
          activeKind === "file" ? "flex min-h-0 flex-1 flex-col" : "hidden"
        }
        aria-hidden={activeKind !== "file"}
      >
        {fileSlot}
      </div>
    </div>
  );
}
