import type { ProjectConfig } from "@/features/projects/types";

export function normalizeFsPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === ".") return ".";
  return trimmed.replace(/[\\/]+$/, "") || trimmed;
}

export function pathsMatch(a: string, b: string): boolean {
  return normalizeFsPath(a) === normalizeFsPath(b);
}

export function projectActiveRoot(project: ProjectConfig): string {
  const override = project.activeWorktreePath?.trim();
  if (override && !pathsMatch(override, project.path)) {
    return override;
  }
  return project.path.trim();
}
