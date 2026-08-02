import { homeDir } from "@tauri-apps/api/path";
import { basename, joinFsPath, parentPath } from "@/features/files";
import { isLocalHostId } from "@/features/hosts";
import { normalizeProjectConfig } from "@/features/projects/lib/validate";
import type { HostProjectEntry, ProjectConfig } from "@/features/projects/types";
import {
  hostFsList,
  hostFsMkdir,
  hostFsRead,
  hostFsRemove,
  hostFsRename,
  hostFsWrite,
  parseSshError,
} from "@/features/ssh";

const REGISTRY_VERSION = 1;
const CONFIG_DIR_SEGMENTS = [".config", "relix"] as const;
const REGISTRY_FILE = "projects.json";
const REGISTRY_TMP = "projects.json.tmp";

export type HostRegistryRead = {
  projects: HostProjectEntry[];
  exists: boolean;
};

type RegistryPaths = {
  home: string;
  dir: string;
  file: string;
  tmp: string;
};

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function isHostProjectEntry(value: unknown): value is HostProjectEntry {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
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

export function toHostProjectEntry(project: ProjectConfig): HostProjectEntry {
  const normalized = normalizeProjectConfig(project);
  return {
    id: normalized.id,
    name: normalized.name,
    path: normalized.path,
    activeWorktreePath: normalized.activeWorktreePath ?? null,
  };
}

export function toProjectConfig(
  hostId: string,
  entry: HostProjectEntry,
): ProjectConfig {
  return normalizeProjectConfig({
    id: entry.id,
    hostId,
    name: entry.name,
    path: entry.path,
    activeWorktreePath: entry.activeWorktreePath ?? null,
  });
}

export function parseHostProjectsFile(text: string): HostProjectEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  let data: unknown;
  try {
    data = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Host projects registry is not valid JSON");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Host projects registry is invalid");
  }

  const obj = data as Record<string, unknown>;
  if (obj.version != null) {
    if (typeof obj.version !== "number" || !Number.isFinite(obj.version)) {
      throw new Error("Host projects registry version is invalid");
    }
    if (obj.version > REGISTRY_VERSION) {
      throw new Error(
        `Unsupported host projects registry version ${obj.version}`,
      );
    }
  }

  if (!Array.isArray(obj.projects)) {
    throw new Error("Host projects registry is missing projects");
  }

  return obj.projects.filter(isHostProjectEntry).map((entry) => ({
    id: entry.id,
    name: entry.name.trim(),
    path: entry.path.trim(),
    activeWorktreePath: entry.activeWorktreePath?.trim() || null,
  }));
}

export function serializeHostProjectsFile(
  projects: HostProjectEntry[],
): string {
  return `${JSON.stringify(
    {
      version: REGISTRY_VERSION,
      projects: projects.map((entry) => ({
        id: entry.id,
        name: entry.name,
        path: entry.path,
        activeWorktreePath: entry.activeWorktreePath ?? null,
      })),
    },
    null,
    2,
  )}\n`;
}

async function resolveHomePath(hostId: string): Promise<string> {
  if (isLocalHostId(hostId)) {
    const home = (await homeDir()).trim();
    if (!home) {
      throw new Error("Could not resolve local home directory");
    }
    return home.replace(/[/\\]+$/, "") || home;
  }

  const listed = await hostFsList(hostId, ".");
  const home = listed.path.trim();
  if (!home || home === ".") {
    throw new Error("Could not resolve host home directory");
  }
  return home;
}

async function resolveRegistryPaths(hostId: string): Promise<RegistryPaths> {
  const home = await resolveHomePath(hostId);
  let dir = home;
  for (const segment of CONFIG_DIR_SEGMENTS) {
    dir = joinFsPath(dir, segment);
  }
  return {
    home,
    dir,
    file: joinFsPath(dir, REGISTRY_FILE),
    tmp: joinFsPath(dir, REGISTRY_TMP),
  };
}

async function pathExists(hostId: string, path: string): Promise<boolean> {
  const parent = parentPath(path);
  const name = basename(path);
  if (!parent || !name) return false;
  try {
    const listed = await hostFsList(hostId, parent);
    return listed.entries.some((entry) => entry.name === name);
  } catch {
    return false;
  }
}

async function ensureDir(hostId: string, path: string): Promise<void> {
  try {
    await hostFsList(hostId, path);
    return;
  } catch {
    // create below
  }

  const parent = parentPath(path);
  if (parent) {
    await ensureDir(hostId, parent);
  }

  try {
    await hostFsMkdir(hostId, path);
  } catch (error) {
    try {
      await hostFsList(hostId, path);
      return;
    } catch {
      throw error;
    }
  }
}

function rewriteError(error: unknown): Error {
  const parsed = parseSshError(error);
  if (parsed.code === "not_connected") {
    return new Error("Connect to save projects on this host");
  }
  return new Error(parsed.message || "Host projects registry failed");
}

export async function readHostProjects(
  hostId: string,
): Promise<HostRegistryRead> {
  const paths = await resolveRegistryPaths(hostId);
  try {
    const raw = await hostFsRead(hostId, paths.file);
    const projects = parseHostProjectsFile(
      decodeText(Uint8Array.from(raw)),
    );
    return { projects, exists: true };
  } catch (error) {
    if (await pathExists(hostId, paths.file)) {
      throw rewriteError(error);
    }
    return { projects: [], exists: false };
  }
}

export async function writeHostProjects(
  hostId: string,
  projects: HostProjectEntry[],
): Promise<void> {
  const paths = await resolveRegistryPaths(hostId);
  try {
    await ensureDir(hostId, paths.dir);
    const payload = encodeText(serializeHostProjectsFile(projects));
    await hostFsWrite(hostId, paths.tmp, payload);

    if (await pathExists(hostId, paths.file)) {
      try {
        await hostFsRemove(hostId, paths.file, false);
      } catch {
        // rename may still replace
      }
    }

    try {
      await hostFsRename(hostId, paths.tmp, paths.file);
    } catch (renameError) {
      await hostFsWrite(hostId, paths.file, payload);
      try {
        await hostFsRemove(hostId, paths.tmp, false);
      } catch {
        // best-effort cleanup
      }
      if (!(await pathExists(hostId, paths.file))) {
        throw renameError;
      }
    }
  } catch (error) {
    throw rewriteError(error);
  }
}
