import { useCallback, useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import {
  hostFsList,
  hostFsMkdir,
  hostFsRead,
  hostFsRemove,
  hostFsRename,
  hostFsWrite,
  sshTmuxWindowPath,
} from "@/features/ssh";
import type { FsEntry } from "@/features/ssh";
import { parseSshError } from "@/features/ssh/errors";
import {
  cacheClearHost,
  cacheGet,
  cacheInvalidate,
  cacheMove,
  cachePut,
  cacheUpdateText,
} from "@/features/files/file-cache";
import {
  classifyFile,
  decodeText,
  encodeText,
  type FileKind,
} from "@/features/files/file-kind";
import { basename, joinFsPath, parentPath } from "@/features/files/format";
import type { FileTransferState } from "@/features/files/types";

export type OpenedFile = {
  entry: FsEntry;
  kind: FileKind;
  bytes: Uint8Array;
  text: string | null;
};

type UseFilesOptions = {
  hostId: string;
  connected: boolean;
  enabled?: boolean;
  shellCwd?: string | null;
  tmuxSession?: string | null;
  tmuxWindowId?: string | null;
  /** When set, browser is rooted here and does not follow shell cwd. */
  rootPath?: string | null;
};

function fingerprintOf(entry: FsEntry) {
  return { size: entry.size, mtime: entry.mtime ?? null };
}

function bytesFromInvoke(data: number[]): Uint8Array {
  return Uint8Array.from(data);
}

function pathsEqual(a: string, b: string): boolean {
  const normalize = (value: string) => {
    if (!value || value === ".") return ".";
    return value.replace(/[\\/]+$/, "") || value;
  };
  return normalize(a) === normalize(b);
}

export function useFiles({
  hostId,
  connected,
  enabled = true,
  shellCwd,
  tmuxSession,
  tmuxWindowId,
  rootPath,
}: UseFilesOptions) {
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, FsEntry[]>
  >({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, true>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, true>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<FileTransferState | null>(null);

  const pathRef = useRef(path);
  pathRef.current = path;
  const expandedRef = useRef(expandedPaths);
  expandedRef.current = expandedPaths;

  const setDirLoading = useCallback((target: string, next: boolean) => {
    setLoadingPaths((current) => {
      if (next) {
        if (current[target]) return current;
        return { ...current, [target]: true };
      }
      if (!current[target]) return current;
      const { [target]: _, ...rest } = current;
      return rest;
    });
  }, []);

  const applyListResult = useCallback(
    (listedPath: string, listedEntries: FsEntry[], asRoot: boolean) => {
      setChildrenByPath((current) => ({
        ...current,
        [listedPath]: listedEntries,
      }));
      if (asRoot) {
        setPath(listedPath);
        setEntries(listedEntries);
      } else if (pathsEqual(listedPath, pathRef.current)) {
        setEntries(listedEntries);
      }
    },
    [],
  );

  const listPath = useCallback(
    async (target: string) => {
      const result = await hostFsList(hostId, target);
      return result;
    },
    [hostId],
  );

  const refresh = useCallback(
    async (nextPath?: string) => {
      if (!connected) {
        setEntries([]);
        setChildrenByPath({});
        setExpandedPaths({});
        setLoadingPaths({});
        setError(null);
        return;
      }

      const currentPath = pathRef.current;
      const navigating = nextPath != null && !pathsEqual(nextPath, currentPath);
      const target = nextPath ?? currentPath;

      setLoading(true);
      setError(null);

      try {
        if (navigating) {
          setDirLoading(target, true);
          const result = await listPath(target);
          setChildrenByPath({ [result.path]: result.entries });
          setExpandedPaths({});
          setPath(result.path);
          setEntries(result.entries);
          setDirLoading(target, false);
          return;
        }

        const expanded = Object.keys(expandedRef.current);
        const targets = Array.from(
          new Set([target, currentPath, ...expanded].filter(Boolean)),
        );

        for (const item of targets) {
          setDirLoading(item, true);
        }

        const results = await Promise.all(
          targets.map(async (item) => {
            try {
              const result = await listPath(item);
              return { ok: true as const, requested: item, result };
            } catch (err) {
              return {
                ok: false as const,
                requested: item,
                message: parseSshError(err).message,
              };
            }
          }),
        );

        let rootFailed: string | null = null;
        setChildrenByPath((current) => {
          const next = { ...current };
          for (const item of results) {
            if (!item.ok) {
              if (
                pathsEqual(item.requested, currentPath) ||
                pathsEqual(item.requested, target)
              ) {
                rootFailed = item.message;
              }
              continue;
            }
            next[item.result.path] = item.result.entries;
            if (item.requested !== item.result.path) {
              delete next[item.requested];
            }
          }
          return next;
        });

        const rootResult = results.find(
          (item) =>
            item.ok &&
            (pathsEqual(item.requested, currentPath) ||
              pathsEqual(item.requested, target) ||
              pathsEqual(item.result.path, currentPath)),
        );
        if (rootResult?.ok) {
          setPath(rootResult.result.path);
          setEntries(rootResult.result.entries);
        } else if (rootFailed) {
          setError(rootFailed);
          setEntries([]);
        }
      } catch (err) {
        setError(parseSshError(err).message);
        setEntries([]);
      } finally {
        setLoading(false);
        setLoadingPaths({});
      }
    },
    [connected, listPath, setDirLoading],
  );

  useEffect(() => {
    if (!enabled) return;

    if (!connected) {
      setPath(".");
      setEntries([]);
      setChildrenByPath({});
      setExpandedPaths({});
      setLoadingPaths({});
      setError(null);
      setTransfer(null);
      void cacheClearHost(hostId);
      return;
    }

    let cancelled = false;
    const fixedRoot = rootPath?.trim() || null;

    async function syncPath() {
      if (fixedRoot) {
        if (cancelled) return;
        if (pathsEqual(fixedRoot, pathRef.current)) return;
        await refresh(fixedRoot);
        return;
      }

      let target = "";
      const windowId = tmuxWindowId?.trim();
      if (windowId) {
        try {
          const windowPath = await sshTmuxWindowPath(
            hostId,
            tmuxSession?.trim() || undefined,
            windowId,
          );
          if (windowPath?.trim()) target = windowPath.trim();
        } catch {
          // fall through to OSC7 cwd / home
        }
      }
      if (!target) target = shellCwd?.trim() || ".";
      if (cancelled) return;
      if (pathsEqual(target, pathRef.current)) return;
      await refresh(target);
    }

    void syncPath();
    return () => {
      cancelled = true;
    };
  }, [
    connected,
    enabled,
    hostId,
    rootPath,
    shellCwd,
    tmuxSession,
    tmuxWindowId,
    refresh,
  ]);

  const openDir = useCallback(
    (nextPath: string) => {
      void refresh(nextPath);
    },
    [refresh],
  );

  const toggleDir = useCallback(
    async (dirPath: string) => {
      if (!connected) return;

      if (expandedRef.current[dirPath]) {
        setExpandedPaths((current) => {
          const { [dirPath]: _, ...rest } = current;
          return rest;
        });
        return;
      }

      setExpandedPaths((current) => ({ ...current, [dirPath]: true }));
      setDirLoading(dirPath, true);
      setError(null);
      try {
        const result = await listPath(dirPath);
        applyListResult(result.path, result.entries, false);
        if (!pathsEqual(result.path, dirPath)) {
          setExpandedPaths((current) => {
            const { [dirPath]: _, ...rest } = current;
            return { ...rest, [result.path]: true };
          });
        }
      } catch (err) {
        setError(parseSshError(err).message);
        setExpandedPaths((current) => {
          const { [dirPath]: _, ...rest } = current;
          return rest;
        });
      } finally {
        setDirLoading(dirPath, false);
      }
    },
    [applyListResult, connected, listPath, setDirLoading],
  );

  const refreshTree = useCallback(() => {
    void refresh();
  }, [refresh]);

  const mkdir = useCallback(async () => {
    const name = window.prompt("New directory name");
    if (!name?.trim()) return;
    const remote = joinFsPath(pathRef.current, name.trim());
    try {
      await hostFsMkdir(hostId, remote);
      await refresh();
    } catch (err) {
      setError(parseSshError(err).message);
    }
  }, [hostId, refresh]);

  const removeEntry = useCallback(
    async (entry: FsEntry) => {
      try {
        await hostFsRemove(hostId, entry.path, entry.isDir);
        cacheInvalidate(hostId, entry.path);
        if (entry.isDir) {
          setExpandedPaths((current) => {
            const next = { ...current };
            for (const key of Object.keys(next)) {
              if (key === entry.path || key.startsWith(`${entry.path}/`) || key.startsWith(`${entry.path}\\`)) {
                delete next[key];
              }
            }
            return next;
          });
          setChildrenByPath((current) => {
            const next = { ...current };
            for (const key of Object.keys(next)) {
              if (key === entry.path || key.startsWith(`${entry.path}/`) || key.startsWith(`${entry.path}\\`)) {
                delete next[key];
              }
            }
            return next;
          });
        }
        await refresh();
      } catch (err) {
        setError(parseSshError(err).message);
        throw err;
      }
    },
    [hostId, refresh],
  );

  const renameEntry = useCallback(
    async (entry: FsEntry, nextName: string) => {
      const name = nextName.trim();
      if (!name || name === entry.name) return;
      if (name.includes("/") || name.includes("\\")) {
        setError("Name cannot contain path separators");
        return;
      }
      const parent = parentPath(entry.path) ?? pathRef.current;
      const to = joinFsPath(parent, name);
      try {
        await hostFsRename(hostId, entry.path, to);
        cacheMove(hostId, entry.path, to);
        if (entry.isDir) {
          setExpandedPaths((current) => {
            const next: Record<string, true> = {};
            for (const key of Object.keys(current)) {
              if (key === entry.path) {
                next[to] = true;
              } else if (
                key.startsWith(`${entry.path}/`) ||
                key.startsWith(`${entry.path}\\`)
              ) {
                next[to + key.slice(entry.path.length)] = true;
              } else {
                next[key] = true;
              }
            }
            return next;
          });
          setChildrenByPath((current) => {
            const next: Record<string, FsEntry[]> = {};
            for (const [key, value] of Object.entries(current)) {
              if (key === entry.path) {
                next[to] = value;
              } else if (
                key.startsWith(`${entry.path}/`) ||
                key.startsWith(`${entry.path}\\`)
              ) {
                next[to + key.slice(entry.path.length)] = value;
              } else {
                next[key] = value;
              }
            }
            return next;
          });
        }
        await refresh();
      } catch (err) {
        setError(parseSshError(err).message);
        throw err;
      }
    },
    [hostId, refresh],
  );

  const findEntry = useCallback(
    (entryPath: string): FsEntry | null => {
      for (const list of Object.values(childrenByPath)) {
        const found = list.find((item) => item.path === entryPath);
        if (found) return found;
      }
      return entries.find((item) => item.path === entryPath) ?? null;
    },
    [childrenByPath, entries],
  );

  const openEntry = useCallback(
    async (entry: FsEntry): Promise<OpenedFile> => {
      if (entry.isDir) {
        throw new Error("Cannot open a directory as a file");
      }
      const fingerprint = fingerprintOf(entry);
      const cached = await cacheGet(hostId, entry.path, fingerprint);
      let bytes: Uint8Array;
      let text: string | null = null;

      if (cached) {
        bytes = cached.bytes;
        text = cached.text;
      } else {
        const raw = await hostFsRead(hostId, entry.path);
        bytes = bytesFromInvoke(raw);
        cachePut(hostId, entry.path, bytes, fingerprint, null);
      }

      const kind = classifyFile(entry.name, bytes);
      if (kind === "text") {
        text = text ?? decodeText(bytes);
        cachePut(hostId, entry.path, bytes, fingerprint, text);
      }

      return { entry, kind, bytes, text };
    },
    [hostId],
  );

  const saveText = useCallback(
    async (entry: FsEntry, text: string) => {
      const bytes = encodeText(text);
      await hostFsWrite(hostId, entry.path, bytes);
      cacheUpdateText(
        hostId,
        entry.path,
        text,
        bytes,
        { size: bytes.byteLength, mtime: null },
      );
      await refresh();
    },
    [hostId, refresh],
  );

  const downloadEntry = useCallback(
    async (entry: FsEntry) => {
      if (entry.isDir) return;
      setTransfer({
        kind: "download",
        name: entry.name,
        busy: true,
        error: null,
      });
      try {
        const fingerprint = fingerprintOf(entry);
        const cached = await cacheGet(hostId, entry.path, fingerprint);
        let bytes: Uint8Array;
        if (cached) {
          bytes = cached.bytes;
        } else {
          const raw = await hostFsRead(hostId, entry.path);
          bytes = bytesFromInvoke(raw);
          cachePut(hostId, entry.path, bytes, fingerprint, null);
        }
        const destination = await save({
          defaultPath: entry.name,
          title: "Save file",
        });
        if (!destination) {
          setTransfer(null);
          return;
        }
        await writeFile(destination, bytes);
        setTransfer({
          kind: "download",
          name: entry.name,
          busy: false,
          error: null,
        });
      } catch (err) {
        setTransfer({
          kind: "download",
          name: entry.name,
          busy: false,
          error: parseSshError(err).message,
        });
      }
    },
    [hostId],
  );

  const uploadFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Upload file",
      });
      if (selected == null) return;
      const localPath = Array.isArray(selected) ? selected[0] : selected;
      if (!localPath) return;
      const name = basename(localPath) || "upload.bin";
      setTransfer({ kind: "upload", name, busy: true, error: null });
      const data = await readFile(localPath);
      const remote = joinFsPath(pathRef.current, name);
      await hostFsWrite(hostId, remote, data);
      cachePut(
        hostId,
        remote,
        data,
        { size: data.byteLength, mtime: null },
        null,
      );
      setTransfer({ kind: "upload", name, busy: false, error: null });
      await refresh();
    } catch (err) {
      const message = parseSshError(err).message;
      setTransfer((current) =>
        current
          ? { ...current, busy: false, error: message }
          : { kind: "upload", name: "file", busy: false, error: message },
      );
    }
  }, [hostId, refresh]);

  return {
    path,
    entries,
    childrenByPath,
    expandedPaths,
    loadingPaths,
    loading,
    error,
    transfer,
    refresh,
    refreshTree,
    openDir,
    toggleDir,
    mkdir,
    removeEntry,
    renameEntry,
    findEntry,
    openEntry,
    saveText,
    downloadEntry,
    uploadFile,
    clearTransfer: () => setTransfer(null),
    clearError: () => setError(null),
  };
}

export type FilesController = ReturnType<typeof useFiles>;
