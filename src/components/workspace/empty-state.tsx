import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
  iconClassName?: string;
  className?: string;
  role?: string;
  id?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconClassName,
  className,
  role,
  id,
}: EmptyStateProps) {
  return (
    <div
      role={role}
      id={id}
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-[env(safe-area-inset-bottom)] text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground",
          iconClassName,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-sm font-medium text-balance">{title}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
