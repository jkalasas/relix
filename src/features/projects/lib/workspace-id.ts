import type {
  WorkspaceId,
  WorkspaceRef,
  WorkspaceScope,
} from "@/features/projects/types";

const ADHOC_SUFFIX = "::adhoc";
const PROJECT_MARKER = "::project::";

export function toWorkspaceId(ref: WorkspaceRef): WorkspaceId {
  if (ref.scope.kind === "adhoc") {
    return `${ref.hostId}${ADHOC_SUFFIX}`;
  }
  return `${ref.hostId}${PROJECT_MARKER}${ref.scope.projectId}`;
}

export function adhocWorkspaceId(hostId: string): WorkspaceId {
  return toWorkspaceId({ hostId, scope: { kind: "adhoc" } });
}

export function projectWorkspaceId(
  hostId: string,
  projectId: string,
): WorkspaceId {
  return toWorkspaceId({
    hostId,
    scope: { kind: "project", projectId },
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
  const projectId = id.slice(markerIndex + PROJECT_MARKER.length);
  if (!hostId || !projectId) return null;
  return { hostId, scope: { kind: "project", projectId } };
}

export function hostIdFromWorkspaceId(id: string): string | null {
  return parseWorkspaceId(id)?.hostId ?? null;
}

export function isWorkspaceForHost(id: string, hostId: string): boolean {
  return id.startsWith(`${hostId}::`);
}

export function scopeLabel(scope: WorkspaceScope, projectName?: string): string {
  if (scope.kind === "adhoc") return "Ad hoc";
  return projectName?.trim() || "Project";
}
