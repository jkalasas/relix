export type {
  HostProjectEntry,
  ProjectConfig,
  WorkspaceId,
  WorkspaceRef,
  WorkspaceScope,
} from "@/features/projects/types";
export {
  adhocWorkspaceId,
  hostIdFromWorkspaceId,
  isWorkspaceForHost,
  parseWorkspaceId,
  projectWorkspaceId,
  scopeLabel,
  toWorkspaceId,
} from "@/features/projects/lib/workspace-id";
export {
  loadProjectsByHost,
  saveProjectsByHost,
} from "@/features/projects/store";
export {
  normalizeProjectConfig,
  validateProjectConfig,
} from "@/features/projects/lib/validate";
export {
  normalizeFsPath,
  pathsMatch,
  projectActiveRoot,
} from "@/features/projects/lib/project-root";
export { useProjects } from "@/features/projects/hooks/use-projects";
export { HostsPage } from "@/features/projects/components/hosts-page";
export { ProjectsPage } from "@/features/projects/components/projects-page";
export { ProjectForm } from "@/features/projects/components/project-form";
export { WorkspaceRecents } from "@/features/projects/components/workspace-recents";
export { WorktreeSwitcher } from "@/features/projects/components/worktree-switcher";
