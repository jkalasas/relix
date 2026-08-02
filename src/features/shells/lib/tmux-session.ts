import { parseWorkspaceId } from "@/features/projects";

export const DEFAULT_TMUX_SESSION = "relix";

const PROJECT_SESSION_MARKER = "_p_";

export function resolveTmuxBase(session?: string | null): string {
  const trimmed = session?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_TMUX_SESSION;
}

export function tmuxSessionForWorkspace(
  base: string,
  workspaceId: string,
): string {
  const resolvedBase = resolveTmuxBase(base);
  const ref = parseWorkspaceId(workspaceId);
  if (!ref || ref.scope.kind === "adhoc") {
    return resolvedBase;
  }
  return `${resolvedBase}${PROJECT_SESSION_MARKER}${ref.scope.projectId}`;
}
