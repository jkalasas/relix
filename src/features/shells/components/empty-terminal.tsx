import { TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyTerminalProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

export function EmptyTerminal({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyTerminalProps) {
  return (
    <div
      role="tabpanel"
      id="panel-terminal"
      aria-labelledby="tab-terminal"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
        <TerminalSquare className="size-5" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-sm font-medium text-balance">{title}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onAction}
        className="min-h-9 px-3 md:min-h-7"
      >
        {actionLabel}
      </Button>
    </div>
  );
}
