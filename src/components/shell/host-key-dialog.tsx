import { Button } from "@/components/ui/button";
import type { SshCommandError } from "@/lib/types";

type HostKeyDialogProps = {
  error: SshCommandError;
  onAccept: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export function HostKeyDialog({
  error,
  onAccept,
  onCancel,
  busy = false,
}: HostKeyDialogProps) {
  const changed = error.code === "host_key_changed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-key-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-elevated p-4 shadow-lg">
        <h2 id="host-key-title" className="text-sm font-semibold">
          {changed ? "Host key changed" : "Trust host key"}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {changed
            ? "The key for this host does not match the key stored in Relix. Someone could be intercepting the connection."
            : "This host has not been trusted yet. Verify the fingerprint before accepting."}
        </p>
        <dl className="mt-3 space-y-1.5 font-mono text-[12px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Host</dt>
            <dd className="truncate text-foreground">
              {error.hostname}:{error.port}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Algorithm</dt>
            <dd className="truncate text-foreground">{error.algorithm}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Fingerprint</dt>
            <dd className="break-all text-foreground">{error.fingerprint}</dd>
          </div>
        </dl>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            className="min-h-9 px-3 md:min-h-7"
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onAccept} disabled={busy} className="min-h-9 px-3 md:min-h-7">
            {changed ? "Replace and connect" : "Accept and connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
