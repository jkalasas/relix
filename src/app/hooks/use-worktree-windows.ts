import { useCallback, useEffect } from "react";
import {
  advertiseWorktreeWindow,
  findWorktreeWindow,
  focusWorktreeWindow,
  openWorktreeWindow,
  worktreeWorkspaceId,
} from "@/features/projects";
import { toastError, toastInfo } from "@/lib/toast";

type UseWorktreeWindowsOptions = {
  workspaceId: string | null;
};

/** Advertise this window's workspace and offer cross-window worktree actions. */
export function useWorktreeWindows({ workspaceId }: UseWorktreeWindowsOptions) {
  useEffect(() => {
    advertiseWorktreeWindow(workspaceId);
  }, [workspaceId]);

  const openInNewWindow = useCallback(
    async (hostId: string, projectId: string, worktreePath: string | null) => {
      const result = await openWorktreeWindow({
        hostId,
        projectId,
        worktreePath,
      });
      if (result === "unsupported") {
        toastInfo("New windows need the desktop app");
      } else if (result === "failed") {
        toastError("Could not open window", "Try again from the worktree list.");
      }
      return result;
    },
    [],
  );

  const selectWithRedirect = useCallback(
    async (
      hostId: string,
      projectId: string,
      worktreePath: string | null,
      localSelect: () => void,
    ): Promise<"focused" | "local"> => {
      const target = worktreeWorkspaceId({ hostId, projectId, worktreePath });
      if (target === workspaceId) {
        localSelect();
        return "local";
      }
      const owner = await findWorktreeWindow(target);
      if (owner) {
        const focused = await focusWorktreeWindow(owner);
        if (focused) return "focused";
      }
      localSelect();
      return "local";
    },
    [workspaceId],
  );

  return { openInNewWindow, selectWithRedirect };
}
