import { cn } from "@/lib/utils";
import type { HostStatus } from "@/lib/types";
import { StatusDot } from "@/components/status-dot";

const chipClass: Record<HostStatus, string> = {
  connected:
    "border-status-connected/25 bg-status-connected/12 text-status-connected",
  idle: "border-border bg-muted text-muted-foreground",
  error: "border-destructive/30 bg-destructive/12 text-destructive",
};

const label: Record<HostStatus, string> = {
  connected: "connected",
  idle: "idle",
  error: "error",
};

type SessionChipProps = {
  status: HostStatus;
  className?: string;
};

export function SessionChip({ status, className }: SessionChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        chipClass[status],
        className,
      )}
    >
      <StatusDot status={status} className="shadow-none" />
      {label[status]}
    </span>
  );
}
