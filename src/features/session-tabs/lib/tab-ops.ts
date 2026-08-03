import { isWorkspaceForHost } from "@/features/projects";
import type { SessionTab } from "@/features/session-tabs/types";

export function neighborId(
  tabs: SessionTab[],
  removedId: string,
): string | null {
  const index = tabs.findIndex((tab) => tab.id === removedId);
  if (index < 0) return tabs[0]?.id ?? null;
  return tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? null;
}

export function dropTab(
  tabs: SessionTab[],
  tabId: string,
): { tabs: SessionTab[]; removed: SessionTab | null } {
  const removed = tabs.find((tab) => tab.id === tabId) ?? null;
  return {
    tabs: tabs.filter((tab) => tab.id !== tabId),
    removed,
  };
}

export function workspaceIdsForHost(
  map: Record<string, unknown>,
  hostId: string,
): string[] {
  return Object.keys(map).filter((id) => isWorkspaceForHost(id, hostId));
}
