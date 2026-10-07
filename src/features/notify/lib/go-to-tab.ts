import { parseWorkspaceId, type WorkspaceScope } from "@/features/projects";
import type { SessionTab } from "@/features/session-tabs";

export type TabNavigator = {
  openWorkspace: (hostId: string, scope: WorkspaceScope) => void;
  selectTab: (workspaceId: string, tabId: string) => void;
  selectShell: (workspaceId: string, hostId: string, shellId: string) => void;
};

/**
 * Finds the workspace holding a tab id.
 */
export function findTabWorkspace(
  tabsByWorkspace: Record<string, SessionTab[]>,
  tabId: string,
): { workspaceId: string; tab: SessionTab } | null {
  for (const [workspaceId, tabs] of Object.entries(tabsByWorkspace)) {
    const tab = tabs.find((item) => item.id === tabId);
    if (tab) return { workspaceId, tab };
  }
  return null;
}

/**
 * Navigates to the workspace + tab that produced a notification.
 * Returns false when the tab is not open anywhere.
 */
export function goToTab(
  navigator: TabNavigator,
  tabsByWorkspace: Record<string, SessionTab[]>,
  tabId: string,
): boolean {
  const found = findTabWorkspace(tabsByWorkspace, tabId);
  if (!found) return false;
  const ref = parseWorkspaceId(found.workspaceId);
  if (!ref) return false;
  navigator.openWorkspace(ref.hostId, ref.scope);
  navigator.selectTab(found.workspaceId, found.tab.id);
  if (found.tab.kind === "shell") {
    navigator.selectShell(found.workspaceId, ref.hostId, found.tab.shellId);
  }
  return true;
}
