import { cn } from "@/lib/utils";
import type { HostStatus } from "@/features/hosts";

const statusClass: Record<HostStatus, string> = {
  connected:
    "bg-status-connected shadow-[0_0_0_3px_color-mix(in_oklch,var(--status-connected)_18%,transparent)]",
  idle: "bg-status-idle",
  error:
    "bg-destructive shadow-[0_0_0_3px_color-mix(in_oklch,var(--destructive)_18%,transparent)]",
};

const statusLabel: Record<HostStatus, string> = {
  connected: "Connected",
  idle: "Disconnected",
  error: "Error",
};

type StatusDotProps = {
  status: HostStatus;
  className?: string;
};

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      role="img"
      aria-label={statusLabel[status]}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        statusClass[status],
        className,
      )}
    />
  );
}
