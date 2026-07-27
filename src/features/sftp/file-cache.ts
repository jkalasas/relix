import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

const CACHE_ROOT = "relix-sftp";
const MEMORY_MAX_BYTES = 48 * 1024 * 1024;
const MEMORY_MAX_ENTRIES = 24;
const DISK_MAX_BYTES = 256 * 1024 * 1024;

export type CacheFingerprint = {
  size: number;
  mtime: number | null;
};

export type CachedFile = {
  path: string;
  size: number;
  mtime: number | null;
  bytes: Uint8Array;
  text: string | null;
  accessedAt: number;
};

type DiskMeta = {
  path: string;
  size: number;
  mtime: number | null;
  savedAt: number;
  byteLength: number;
};

type HostMemory = Map<string, CachedFile>;

const memoryByHost = new Map<string, HostMemory>();

function hostMemory(hostId: string): HostMemory {
  let map = memoryByHost.get(hostId);
  if (!map) {
    map = new Map();
    memoryByHost.set(hostId, map);
  }
  return map;
}

function matchesFingerprint(
  entry: { size: number; mtime: number | null },
  fingerprint: CacheFingerprint,
): boolean {
  if (entry.size !== fingerprint.size) return false;
  if (fingerprint.mtime != null && entry.mtime != null) {
    return entry.mtime === fingerprint.mtime;
  }
  return true;
}

function memoryBytes(map: HostMemory): number {
  let total = 0;
  for (const entry of map.values()) total += entry.bytes.byteLength;
  return total;
}

function evictMemory(map: HostMemory): void {
  while (
    map.size > MEMORY_MAX_ENTRIES ||
    memoryBytes(map) > MEMORY_MAX_BYTES
  ) {
    let oldestPath: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [path, entry] of map) {
      if (entry.accessedAt < oldestAt) {
        oldestAt = entry.accessedAt;
        oldestPath = path;
      }
    }
    if (!oldestPath) break;
    map.delete(oldestPath);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hostDir(hostId: string): Promise<string> {
  const hash = await sha256Hex(hostId);
  return `${CACHE_ROOT}/${hash}`;
}

async function ensureHostDir(hostId: string): Promise<string> {
  const dir = await hostDir(hostId);
  if (!(await exists(CACHE_ROOT, { baseDir: BaseDirectory.AppCache }))) {
    await mkdir(CACHE_ROOT, {
      baseDir: BaseDirectory.AppCache,
      recursive: true,
    });
  }
  if (!(await exists(dir, { baseDir: BaseDirectory.AppCache }))) {
    await mkdir(dir, { baseDir: BaseDirectory.AppCache, recursive: true });
  }
  return dir;
}

async function filePaths(
  hostId: string,
  path: string,
): Promise<{ bin: string; meta: string }> {
  const dir = await ensureHostDir(hostId);
  const hash = await sha256Hex(path);
  return {
    bin: `${dir}/${hash}.bin`,
    meta: `${dir}/${hash}.json`,
  };
}

async function readDisk(
  hostId: string,
  path: string,
  fingerprint: CacheFingerprint,
): Promise<CachedFile | null> {
  try {
    const { bin, meta } = await filePaths(hostId, path);
    if (!(await exists(meta, { baseDir: BaseDirectory.AppCache }))) return null;
    if (!(await exists(bin, { baseDir: BaseDirectory.AppCache }))) return null;
    const raw = await readTextFile(meta, { baseDir: BaseDirectory.AppCache });
    const parsed = JSON.parse(raw) as DiskMeta;
    if (parsed.path !== path) return null;
    if (!matchesFingerprint(parsed, fingerprint)) return null;
    const bytes = await readFile(bin, { baseDir: BaseDirectory.AppCache });
    return {
      path,
      size: parsed.size,
      mtime: parsed.mtime,
      bytes,
      text: null,
      accessedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function writeDisk(
  hostId: string,
  entry: CachedFile,
): Promise<void> {
  try {
    const { bin, meta } = await filePaths(hostId, entry.path);
    const diskMeta: DiskMeta = {
      path: entry.path,
      size: entry.size,
      mtime: entry.mtime,
      savedAt: Date.now(),
      byteLength: entry.bytes.byteLength,
    };
    await writeFile(bin, entry.bytes, { baseDir: BaseDirectory.AppCache });
    await writeTextFile(meta, JSON.stringify(diskMeta), {
      baseDir: BaseDirectory.AppCache,
    });
    await pruneDisk(hostId);
  } catch {
    // cache is best-effort
  }
}

async function pruneDisk(hostId: string): Promise<void> {
  try {
    const dir = await hostDir(hostId);
    if (!(await exists(dir, { baseDir: BaseDirectory.AppCache }))) return;
    const entries = await readDir(dir, { baseDir: BaseDirectory.AppCache });
    const metas: Array<DiskMeta & { base: string }> = [];
    let total = 0;
    for (const entry of entries) {
      if (!entry.name.endsWith(".json")) continue;
      const metaPath = `${dir}/${entry.name}`;
      try {
        const raw = await readTextFile(metaPath, {
          baseDir: BaseDirectory.AppCache,
        });
        const parsed = JSON.parse(raw) as DiskMeta;
        const base = entry.name.slice(0, -".json".length);
        metas.push({ ...parsed, base });
        total += parsed.byteLength;
      } catch {
        // skip corrupt
      }
    }
    if (total <= DISK_MAX_BYTES) return;
    metas.sort((a, b) => a.savedAt - b.savedAt);
    for (const item of metas) {
      if (total <= DISK_MAX_BYTES) break;
      try {
        await remove(`${dir}/${item.base}.bin`, {
          baseDir: BaseDirectory.AppCache,
        });
      } catch {
        // ignore
      }
      try {
        await remove(`${dir}/${item.base}.json`, {
          baseDir: BaseDirectory.AppCache,
        });
      } catch {
        // ignore
      }
      total -= item.byteLength;
    }
  } catch {
    // best-effort
  }
}

export async function cacheGet(
  hostId: string,
  path: string,
  fingerprint: CacheFingerprint,
): Promise<CachedFile | null> {
  const map = hostMemory(hostId);
  const mem = map.get(path);
  if (mem && matchesFingerprint(mem, fingerprint)) {
    mem.accessedAt = Date.now();
    return mem;
  }
  if (mem) map.delete(path);

  const disk = await readDisk(hostId, path, fingerprint);
  if (!disk) return null;
  map.set(path, disk);
  evictMemory(map);
  return disk;
}

export function cachePut(
  hostId: string,
  path: string,
  bytes: Uint8Array,
  fingerprint: CacheFingerprint,
  text: string | null = null,
): CachedFile {
  const map = hostMemory(hostId);
  const entry: CachedFile = {
    path,
    size: fingerprint.size,
    mtime: fingerprint.mtime,
    bytes,
    text,
    accessedAt: Date.now(),
  };
  map.set(path, entry);
  evictMemory(map);
  void writeDisk(hostId, entry);
  return entry;
}

export function cacheUpdateText(
  hostId: string,
  path: string,
  text: string,
  bytes: Uint8Array,
  fingerprint: CacheFingerprint,
): CachedFile {
  return cachePut(hostId, path, bytes, fingerprint, text);
}

export function cacheInvalidate(hostId: string, path: string): void {
  hostMemory(hostId).delete(path);
  void (async () => {
    try {
      const { bin, meta } = await filePaths(hostId, path);
      if (await exists(bin, { baseDir: BaseDirectory.AppCache })) {
        await remove(bin, { baseDir: BaseDirectory.AppCache });
      }
      if (await exists(meta, { baseDir: BaseDirectory.AppCache })) {
        await remove(meta, { baseDir: BaseDirectory.AppCache });
      }
    } catch {
      // best-effort
    }
  })();
}

export function cacheMove(
  hostId: string,
  from: string,
  to: string,
): void {
  const map = hostMemory(hostId);
  const entry = map.get(from);
  if (entry) {
    map.delete(from);
    map.set(to, { ...entry, path: to, accessedAt: Date.now() });
  }
  void (async () => {
    try {
      const fromPaths = await filePaths(hostId, from);
      const toPaths = await filePaths(hostId, to);
      if (!(await exists(fromPaths.bin, { baseDir: BaseDirectory.AppCache }))) {
        return;
      }
      const bytes = await readFile(fromPaths.bin, {
        baseDir: BaseDirectory.AppCache,
      });
      let meta: DiskMeta | null = null;
      if (await exists(fromPaths.meta, { baseDir: BaseDirectory.AppCache })) {
        meta = JSON.parse(
          await readTextFile(fromPaths.meta, {
            baseDir: BaseDirectory.AppCache,
          }),
        ) as DiskMeta;
      }
      await writeFile(toPaths.bin, bytes, { baseDir: BaseDirectory.AppCache });
      await writeTextFile(
        toPaths.meta,
        JSON.stringify({
          path: to,
          size: meta?.size ?? bytes.byteLength,
          mtime: meta?.mtime ?? null,
          savedAt: Date.now(),
          byteLength: bytes.byteLength,
        } satisfies DiskMeta),
        { baseDir: BaseDirectory.AppCache },
      );
      await remove(fromPaths.bin, { baseDir: BaseDirectory.AppCache });
      if (await exists(fromPaths.meta, { baseDir: BaseDirectory.AppCache })) {
        await remove(fromPaths.meta, { baseDir: BaseDirectory.AppCache });
      }
    } catch {
      // best-effort
    }
  })();
}

export async function cacheClearHost(hostId: string): Promise<void> {
  memoryByHost.delete(hostId);
  try {
    const dir = await hostDir(hostId);
    if (await exists(dir, { baseDir: BaseDirectory.AppCache })) {
      await remove(dir, {
        baseDir: BaseDirectory.AppCache,
        recursive: true,
      });
    }
  } catch {
    // best-effort
  }
}
