import { useCallback, useState } from "react";
import {
  loadProjectsByHost,
  saveProjectsByHost,
} from "@/features/projects/store";
import type { ProjectConfig } from "@/features/projects/types";
import { normalizeProjectConfig } from "@/features/projects/lib/validate";

export function useProjects() {
  const [projectsByHost, setProjectsByHost] = useState<
    Record<string, ProjectConfig[]>
  >({});

  const loadProjects = useCallback(async () => {
    const loaded = await loadProjectsByHost();
    setProjectsByHost(loaded);
    return loaded;
  }, []);

  const persist = useCallback(
    async (next: Record<string, ProjectConfig[]>) => {
      setProjectsByHost(next);
      await saveProjectsByHost(next);
    },
    [],
  );

  const projectsForHost = useCallback(
    (hostId: string) => projectsByHost[hostId] ?? [],
    [projectsByHost],
  );

  const getProject = useCallback(
    (hostId: string, projectId: string) =>
      (projectsByHost[hostId] ?? []).find((project) => project.id === projectId) ??
      null,
    [projectsByHost],
  );

  const saveProject = useCallback(
    async (project: ProjectConfig) => {
      const normalized = normalizeProjectConfig(project);
      const next = { ...projectsByHost };
      const list = [...(next[normalized.hostId] ?? [])];
      const index = list.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        list[index] = normalized;
      } else {
        list.push(normalized);
      }
      next[normalized.hostId] = list;
      await persist(next);
      return normalized;
    },
    [persist, projectsByHost],
  );

  const deleteProject = useCallback(
    async (hostId: string, projectId: string) => {
      const list = projectsByHost[hostId] ?? [];
      if (!list.some((project) => project.id === projectId)) return;
      const next = {
        ...projectsByHost,
        [hostId]: list.filter((project) => project.id !== projectId),
      };
      await persist(next);
    },
    [persist, projectsByHost],
  );

  const removeHostProjects = useCallback(
    async (hostId: string) => {
      if (!(hostId in projectsByHost)) return;
      const next = { ...projectsByHost };
      delete next[hostId];
      await persist(next);
    },
    [persist, projectsByHost],
  );

  return {
    projectsByHost,
    loadProjects,
    projectsForHost,
    getProject,
    saveProject,
    deleteProject,
    removeHostProjects,
  };
}
