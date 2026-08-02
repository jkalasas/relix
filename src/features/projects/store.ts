import { LazyStore } from "@tauri-apps/plugin-store";
import type { ProjectConfig } from "@/features/projects/types";

const STORE_PATH = "relix.json";
const PROJECTS_KEY = "projects";

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_PATH));
  }
  return storePromise;
}

function isProjectConfig(value: unknown): value is ProjectConfig {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.hostId !== "string" ||
    typeof obj.name !== "string" ||
    typeof obj.path !== "string"
  ) {
    return false;
  }
  if (
    obj.activeWorktreePath != null &&
    typeof obj.activeWorktreePath !== "string"
  ) {
    return false;
  }
  return true;
}

/** Client-side cache only. Host `~/.config/relix/projects.json` is authoritative. */
export async function loadProjectsByHost(): Promise<
  Record<string, ProjectConfig[]>
> {
  try {
    const store = await getStore();
    const raw = await store.get<Record<string, unknown>>(PROJECTS_KEY);
    if (!raw || typeof raw !== "object") return {};

    const result: Record<string, ProjectConfig[]> = {};
    for (const [hostId, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      result[hostId] = list.filter(isProjectConfig);
    }
    return result;
  } catch {
    return {};
  }
}

/** Persist the offline project cache. Does not write the host registry. */
export async function saveProjectsByHost(
  projects: Record<string, ProjectConfig[]>,
): Promise<void> {
  const store = await getStore();
  await store.set(PROJECTS_KEY, projects);
  await store.save();
}
