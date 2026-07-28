import { TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/empty-state";

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
    <EmptyState
      role="tabpanel"
      id="panel-terminal"
      icon={TerminalSquare}
      title={title}
      description={description}
      action={
        <Button
          type="button"
          size="sm"
          onClick={onAction}
          className="min-h-9 px-3 md:min-h-7"
        >
          {actionLabel}
        </Button>
      }
    />
  );
}
