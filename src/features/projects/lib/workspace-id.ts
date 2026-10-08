import type {
  WorkspaceId,
  WorkspaceRef,
  WorkspaceScope,
} from "@/features/projects/types";

const ADHOC_SUFFIX = "::adhoc";
const PROJECT_MARKER = "::project::";
const WORKTREE_MARKER = "::worktree::";

/** Normalize an optional worktree path to a stable scope value. */
export function normalizeWorktreePath(
  path: string | null | undefined,
): string | null {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  return trimmed ? trimmed : null;
}

export function toWorkspaceId(ref: WorkspaceRef): WorkspaceId {
  if (ref.scope.kind === "adhoc") {
    return `${ref.hostId}${ADHOC_SUFFIX}`;
  }
  const worktree = normalizeWorktreePath(ref.scope.worktreePath);
  if (worktree) {
    return `${ref.hostId}${PROJECT_MARKER}${ref.scope.projectId}${WORKTREE_MARKER}${encodeURIComponent(worktree)}`;
  }
  return `${ref.hostId}${PROJECT_MARKER}${ref.scope.projectId}`;
}

export function adhocWorkspaceId(hostId: string): WorkspaceId {
  return toWorkspaceId({ hostId, scope: { kind: "adhoc" } });
}

export function projectWorkspaceId(
  hostId: string,
  projectId: string,
  worktreePath?: string | null,
): WorkspaceId {
  return toWorkspaceId({
    hostId,
    scope: { kind: "project", projectId, worktreePath },
  });
}

export function parseWorkspaceId(id: string): WorkspaceRef | null {
  if (id.endsWith(ADHOC_SUFFIX)) {
    const hostId = id.slice(0, -ADHOC_SUFFIX.length);
    if (!hostId) return null;
    return { hostId, scope: { kind: "adhoc" } };
  }

  const markerIndex = id.indexOf(PROJECT_MARKER);
  if (markerIndex <= 0) return null;
  const hostId = id.slice(0, markerIndex);
  const rest = id.slice(markerIndex + PROJECT_MARKER.length);
  if (!hostId || !rest) return null;
  const worktreeIndex = rest.indexOf(WORKTREE_MARKER);
  if (worktreeIndex < 0) {
    if (!rest) return null;
    return { hostId, scope: { kind: "project", projectId: rest } };
  }
  const projectId = rest.slice(0, worktreeIndex);
  const encoded = rest.slice(worktreeIndex + WORKTREE_MARKER.length);
  if (!projectId || !encoded) return null;
  let worktreePath: string;
  try {
    worktreePath = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (!worktreePath.trim()) return null;
  return {
    hostId,
    scope: { kind: "project", projectId, worktreePath },
  };
}

export function hostIdFromWorkspaceId(id: string): string | null {
  return parseWorkspaceId(id)?.hostId ?? null;
}

export function isWorkspaceForHost(id: string, hostId: string): boolean {
  return id.startsWith(`${hostId}::`);
}

export function isWorkspaceForProject(
  id: string,
  hostId: string,
  projectId: string,
): boolean {
  return (
    id === `${hostId}${PROJECT_MARKER}${projectId}` ||
    id.startsWith(`${hostId}${PROJECT_MARKER}${projectId}${WORKTREE_MARKER}`)
  );
}

/** Effective filesystem root for a scope: explicit worktree wins, else home. */
export function scopeWorktreePath(scope: WorkspaceScope): string | null {
  if (scope.kind !== "project") return null;
  return normalizeWorktreePath(scope.worktreePath);
}

export function scopeLabel(scope: WorkspaceScope, projectName?: string): string {
  if (scope.kind === "adhoc") return "Ad hoc";
  return projectName?.trim() || "Project";
}
