import { useCallback, useRef, useState } from "react";
import {
  readHostProjects,
  toHostProjectEntry,
  toProjectConfig,
  writeHostProjects,
} from "@/features/projects/lib/host-registry";
import { normalizeProjectConfig } from "@/features/projects/lib/validate";
import {
  loadProjectsByHost,
  saveProjectsByHost,
} from "@/features/projects/store";
import type { ProjectConfig } from "@/features/projects/types";

export function useProjects() {
  const [projectsByHost, setProjectsByHost] = useState<
    Record<string, ProjectConfig[]>
  >({});
  const projectsByHostRef = useRef(projectsByHost);
  projectsByHostRef.current = projectsByHost;

  const syncInflightRef = useRef(new Map<string, Promise<void>>());

  const loadProjects = useCallback(async () => {
    const loaded = await loadProjectsByHost();
    projectsByHostRef.current = loaded;
    setProjectsByHost(loaded);
    return loaded;
  }, []);

  const persistCache = useCallback(
    async (next: Record<string, ProjectConfig[]>) => {
      projectsByHostRef.current = next;
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

  const syncHostProjects = useCallback(async (hostId: string) => {
    const existing = syncInflightRef.current.get(hostId);
    if (existing) return existing;

    const run = (async () => {
      const { projects: hostEntries, exists } = await readHostProjects(hostId);
      let list = hostEntries.map((entry) => toProjectConfig(hostId, entry));

      if (!exists) {
        const cached = projectsByHostRef.current[hostId] ?? [];
        if (cached.length > 0) {
          const entries = cached.map(toHostProjectEntry);
          await writeHostProjects(hostId, entries);
          list = entries.map((entry) => toProjectConfig(hostId, entry));
        }
      }

      const next = {
        ...projectsByHostRef.current,
        [hostId]: list,
      };
      await persistCache(next);
    })().finally(() => {
      syncInflightRef.current.delete(hostId);
    });

    syncInflightRef.current.set(hostId, run);
    return run;
  }, [persistCache]);

  const saveProject = useCallback(
    async (project: ProjectConfig) => {
      const normalized = normalizeProjectConfig(project);
      const hostId = normalized.hostId;
      const list = [...(projectsByHostRef.current[hostId] ?? [])];
      const index = list.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        list[index] = normalized;
      } else {
        list.push(normalized);
      }

      await writeHostProjects(hostId, list.map(toHostProjectEntry));

      const next = {
        ...projectsByHostRef.current,
        [hostId]: list,
      };
      await persistCache(next);
      return normalized;
    },
    [persistCache],
  );

  const deleteProject = useCallback(
    async (hostId: string, projectId: string) => {
      const list = projectsByHostRef.current[hostId] ?? [];
      if (!list.some((project) => project.id === projectId)) return;
      const nextList = list.filter((project) => project.id !== projectId);

      await writeHostProjects(hostId, nextList.map(toHostProjectEntry));

      const next = {
        ...projectsByHostRef.current,
        [hostId]: nextList,
      };
      await persistCache(next);
    },
    [persistCache],
  );

  const removeHostProjects = useCallback(
    async (hostId: string) => {
      if (!(hostId in projectsByHostRef.current)) return;
      const next = { ...projectsByHostRef.current };
      delete next[hostId];
      await persistCache(next);
    },
    [persistCache],
  );

  return {
    projectsByHost,
    loadProjects,
    syncHostProjects,
    projectsForHost,
    getProject,
    saveProject,
    deleteProject,
    removeHostProjects,
  };
}
