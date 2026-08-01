import { pathsMatch } from "@/features/projects/lib/project-root";
import type { ProjectConfig } from "@/features/projects/types";

export function validateProjectConfig(
  form: Pick<ProjectConfig, "name" | "path">,
): string | null {
  if (!form.name.trim()) return "Name is required";
  if (!form.path.trim()) return "Directory is required";
  return null;
}

export function normalizeProjectConfig(
  form: ProjectConfig,
): ProjectConfig {
  const path = form.path.trim();
  const override = form.activeWorktreePath?.trim() || null;
  const activeWorktreePath =
    override && !pathsMatch(override, path) ? override : null;
  return {
    ...form,
    name: form.name.trim(),
    path,
    activeWorktreePath,
  };
}
