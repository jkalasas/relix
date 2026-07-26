import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Host } from "@/lib/types";

type SftpPanelProps = {
  host: Host;
  onConnect: () => void;
};

export function SftpPanel({ host, onConnect }: SftpPanelProps) {
  if (host.status !== "connected") {
    return (
      <div
        role="tabpanel"
        id="panel-sftp"
        aria-labelledby="tab-sftp"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
          <FolderOpen className="size-5" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h3 className="text-sm font-medium text-balance">SFTP unavailable</h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            Connect to {host.name} before browsing or transferring files.
          </p>
        </div>
        <Button type="button" size="sm" onClick={onConnect}>
          Connect
        </Button>
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="panel-sftp"
      aria-labelledby="tab-sftp"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <p className="truncate font-mono text-xs text-muted-foreground">
          {host.user}@{host.hostname}:/home/{host.user}
        </p>
        <Button type="button" variant="outline" size="sm">
          <Upload data-icon="inline-start" />
          Upload
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-status-transfer">
          <FolderOpen className="size-5" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h3 className="text-sm font-medium text-balance">
            File browser ready
          </h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            SFTP listing will appear here once the transfer backend is wired.
            Paths use mono for scanability; active transfers light up amber.
          </p>
        </div>
      </div>
    </div>
  );
}
