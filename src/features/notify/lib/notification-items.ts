import {
  parseWorkspaceId,
  scopeLabel,
  type ProjectConfig,
} from "@/features/projects";
import type { SessionTab } from "@/features/session-tabs";
import { sessionDisplayTitle, type ShellSession } from "@/features/shells";
import type { Host } from "@/features/hosts";
import type { NotificationEntry } from "@/features/notify/types";

export type NotificationItem = NotificationEntry & {
  hostName: string;
  scopeName: string;
  tabLabel: string;
};

type ItemContext = {
  tabsByWorkspace: Record<string, SessionTab[]>;
  hosts: Host[];
  projectsByHost: Record<string, ProjectConfig[]>;
  sessionsByWorkspace: Record<string, ShellSession[]>;
};

/**
 * Resolves a tab label from live sessions, falling back to the raw tab id.
 */
export function describeTab(
  tabId: string,
  workspaceId: string | null,
  ctx: Pick<ItemContext, "tabsByWorkspace" | "sessionsByWorkspace">,
): string {
  if (!workspaceId) return tabId;
  const tab = ctx.tabsByWorkspace[workspaceId]?.find(
    (item) => item.id === tabId,
  );
  if (!tab) return tabId;
  if (tab.kind === "shell") {
    const session = ctx.sessionsByWorkspace[workspaceId]?.find(
      (item) => item.id === tab.shellId,
    );
    return session ? sessionDisplayTitle(session) : tabId;
  }
  if (tab.kind === "file") return tab.name;
  if (tab.kind === "files") return "Files";
  if (tab.kind === "ports") return "Ports";
  return "Git";
}

/**
 * Enriches raw entries with host, scope, and tab labels for the bell list.
 * Newest first.
 */
export function buildNotificationItems(
  entries: NotificationEntry[],
  ctx: ItemContext,
): NotificationItem[] {
  const hostsById = new Map(ctx.hosts.map((host) => [host.id, host]));
  return [...entries]
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .map((entry) => {
      const host = hostsById.get(entry.hostId);
      let scopeName = "Unknown workspace";
      const ref = entry.workspaceId
        ? parseWorkspaceId(entry.workspaceId)
        : null;
      if (ref) {
        const scope = ref.scope;
        if (scope.kind === "adhoc") {
          scopeName = scopeLabel(scope);
        } else {
          const project = ctx.projectsByHost[ref.hostId]?.find(
            (item) => item.id === scope.projectId,
          );
          scopeName = scopeLabel(scope, project?.name);
        }
      }
      return {
        ...entry,
        hostName: host?.name ?? "Unknown host",
        scopeName,
        tabLabel: describeTab(entry.tabId, entry.workspaceId, ctx),
      };
    });
}
