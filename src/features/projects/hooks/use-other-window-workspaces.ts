import { useMemo, useSyncExternalStore } from "react";
import {
  currentWindowLabel,
  getWorktreeOwners,
  subscribeWorktreeOwners,
} from "@/features/projects";

/**
 * Workspace ids shown in other windows (not this one).
 * Lets activity indicators reflect every window, not just this webview.
 */
export function useOtherWindowWorkspaces(): Set<string> {
  const owners = useSyncExternalStore(
    subscribeWorktreeOwners,
    getWorktreeOwners,
  );
  const self = useMemo(() => currentWindowLabel(), []);
  return useMemo(
    () =>
      new Set(
        owners
          .filter((owner) => owner.label !== self)
          .map((owner) => owner.workspaceId),
      ),
    [owners, self],
  );
}
