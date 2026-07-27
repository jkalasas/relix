import { Button } from "@/components/ui/button";
import type { BackgroundReadiness } from "@/features/android-background/types";
import { cn } from "@/lib/utils";

type BackgroundSetupDialogProps = {
  open: boolean;
  readiness: BackgroundReadiness;
  busy?: boolean;
  onEnable: () => void;
  onOpenSettings: () => void;
};

function ChecklistRow({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span
        className={cn(
          "inline-block size-2 shrink-0 rounded-full",
          ok ? "bg-status-connected" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
          {ok ? "ok" : "required"}
        </span>
      </span>
    </div>
  );
}

export function BackgroundSetupDialog({
  open,
  readiness,
  busy = false,
  onEnable,
  onOpenSettings,
}: BackgroundSetupDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="background-setup-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-elevated p-4 shadow-lg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2
          id="background-setup-title"
          className="text-sm font-semibold text-foreground"
        >
          Background usage required
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Android freezes or kills apps that leave the screen. Relix holds SSH
          sessions, tunnels, and SFTP in memory. Without unrestricted background
          access, those links die at random.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          While a host is connected, Relix shows a persistent notification so
          Android keeps the process alive. Use{" "}
          <span className="font-mono text-foreground">Stop</span> on that
          notification to end every session.
        </p>

        <div className="mt-4 space-y-2 rounded-lg border border-border bg-background px-3 py-3">
          <ChecklistRow
            label="Notifications"
            ok={readiness.notificationsGranted}
          />
          <ChecklistRow
            label="Unrestricted battery"
            ok={readiness.batteryUnrestricted}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onEnable}
            disabled={busy}
            className="min-h-11 w-full md:min-h-7"
          >
            {busy ? "Waiting for system…" : "Enable background"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            disabled={busy}
            className="min-h-11 w-full md:min-h-7"
          >
            Open battery settings
          </Button>
        </div>
      </div>
    </div>
  );
}
