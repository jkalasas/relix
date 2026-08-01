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
  return {
    ...form,
    name: form.name.trim(),
    path: form.path.trim(),
  };
}
