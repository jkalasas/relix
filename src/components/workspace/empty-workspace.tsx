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
      title="Pick a host to get started"
      description="Choose a host, open Ad hoc or a project, then work with shells, files, and tunnels."
      iconClassName="text-primary"
      action={
        <Button type="button" size="sm" onClick={onAddHost}>
          Add host
        </Button>
      }
    />
  );
}
