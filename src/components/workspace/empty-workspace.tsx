import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/empty-state";

type EmptyWorkspaceProps = {
  onAddHost: () => void;
};

export function EmptyWorkspace({ onAddHost }: EmptyWorkspaceProps) {
  return (
    <EmptyState
      icon={Cable}
      title="Pick a host to open a session"
      description="Relix keeps SSH, ports, and files in one session. Select a host from the rail, or add a new one to get started."
      iconClassName="text-primary"
      action={
        <Button type="button" size="sm" onClick={onAddHost}>
          Add host
        </Button>
      }
    />
  );
}
