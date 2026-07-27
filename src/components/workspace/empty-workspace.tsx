import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyWorkspaceProps = {
  onAddHost: () => void;
};

export function EmptyWorkspace({ onAddHost }: EmptyWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-primary">
        <Cable className="size-5" aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-base font-semibold tracking-tight text-balance">
          Pick a host to open a session
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Relix keeps SSH, port forwards, and SFTP in one session. Select a host
          from the rail, or add a new one to get started.
        </p>
      </div>
      <Button type="button" size="sm" onClick={onAddHost}>
        Add host
      </Button>
    </div>
  );
}
