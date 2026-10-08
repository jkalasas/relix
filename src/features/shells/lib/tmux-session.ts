import { parseWorkspaceId } from "@/features/projects";

export const DEFAULT_TMUX_SESSION = "relix";

const PROJECT_SESSION_MARKER = "_p_";
const WORKTREE_SESSION_MARKER = "_w_";

/** Stable tmux-safe hash of a worktree path (base36, no special chars). */
export function hashWorktreePath(path: string): string {
  let hash = 5381;
  for (let i = 0; i < path.length; i += 1) {
    hash = ((hash << 5) + hash + path.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function sanitizeSessionSegment(segment: string): string {
  const cleaned = segment.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 48);
  return cleaned || "x";
}

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
  const projectSegment = sanitizeSessionSegment(ref.scope.projectId);
  const projectSession = `${resolvedBase}${PROJECT_SESSION_MARKER}${projectSegment}`;
  const worktree = ref.scope.worktreePath?.trim();
  if (!worktree) return projectSession;
  return `${projectSession}${WORKTREE_SESSION_MARKER}${hashWorktreePath(worktree)}`;
}
