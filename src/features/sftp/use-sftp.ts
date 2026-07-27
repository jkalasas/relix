import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import {
  sshSftpList,
  sshSftpMkdir,
  sshSftpRead,
  sshSftpRemove,
  sshSftpRename,
  sshSftpWrite,
  sshTmuxWindowPath,
} from "@/features/ssh";
import type { SftpEntry } from "@/features/ssh";
import { parseSshError } from "@/features/ssh/errors";
import {
  cacheClearHost,
  cacheGet,
  cacheInvalidate,
  cacheMove,
  cachePut,
  cacheUpdateText,
} from "@/features/sftp/file-cache";
import {
  classifyFile,
  decodeText,
  encodeText,
  type FileKind,
} from "@/features/sftp/file-kind";
import { basename, joinRemotePath } from "@/features/sftp/format";
import type { SftpTransferState } from "@/features/sftp/types";

export type OpenedRemoteFile = {
  entry: SftpEntry;
  kind: FileKind;
  bytes: Uint8Array;
  text: string | null;
};

type UseSftpOptions = {
  hostId: string;
  connected: boolean;
  shellCwd?: string | null;
  tmuxSession?: string | null;
  tmuxWindowId?: string | null;
};

function fingerprintOf(entry: SftpEntry) {
  return { size: entry.size, mtime: entry.mtime ?? null };
}

function bytesFromInvoke(data: number[]): Uint8Array {
  return Uint8Array.from(data);
}

export function useSftp({
  hostId,
  connected,
  shellCwd,
  tmuxSession,
  tmuxWindowId,
}: UseSftpOptions) {
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<SftpTransferState | null>(null);

  const refresh = useCallback(
    async (nextPath?: string) => {
      if (!connected) {
        setEntries([]);
        setError(null);
        return;
      }
      const target = nextPath ?? path;
      setLoading(true);
      setError(null);
      try {
        const result = await sshSftpList(hostId, target);
        setPath(result.path);
        setEntries(result.entries);
      } catch (err) {
        setError(parseSshError(err).message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [connected, hostId, path],
  );

  useEffect(() => {
    if (!connected) {
      setPath(".");
      setEntries([]);
      setError(null);
      setTransfer(null);
      void cacheClearHost(hostId);
      return;
    }

    let cancelled = false;

    async function openAtShellDir() {
      let target = "";
      const windowId = tmuxWindowId?.trim();
      if (windowId) {
        try {
          const path = await sshTmuxWindowPath(
            hostId,
            tmuxSession?.trim() || undefined,
            windowId,
          );
          if (path?.trim()) target = path.trim();
        } catch {
          // fall through to OSC7 cwd / home
        }
      }
      if (!target) target = shellCwd?.trim() || ".";
      if (!cancelled) await refresh(target);
    }

    void openAtShellDir();
    return () => {
      cancelled = true;
    };
    // seed from active shell/tmux window on open only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, hostId]);

  const openDir = useCallback(
    (nextPath: string) => {
      void refresh(nextPath);
    },
    [refresh],
  );

  const mkdir = useCallback(async () => {
    const name = window.prompt("New directory name");
    if (!name?.trim()) return;
    const remote = joinRemotePath(path, name.trim());
    try {
      await sshSftpMkdir(hostId, remote);
      await refresh();
    } catch (err) {
      setError(parseSshError(err).message);
    }
  }, [hostId, path, refresh]);

  const removeEntry = useCallback(
    async (entry: SftpEntry) => {
      try {
        await sshSftpRemove(hostId, entry.path, entry.isDir);
        cacheInvalidate(hostId, entry.path);
        await refresh();
      } catch (err) {
        setError(parseSshError(err).message);
        throw err;
      }
    },
    [hostId, refresh],
  );

  const renameEntry = useCallback(
    async (entry: SftpEntry, nextName: string) => {
      const name = nextName.trim();
      if (!name || name === entry.name) return;
      if (name.includes("/") || name.includes("\\")) {
        setError("Name cannot contain path separators");
        return;
      }
      const parent = entry.path.includes("/")
        ? entry.path.slice(0, entry.path.lastIndexOf("/")) || "/"
        : path;
      const to = joinRemotePath(parent === "" ? "/" : parent, name);
      try {
        await sshSftpRename(hostId, entry.path, to);
        cacheMove(hostId, entry.path, to);
        await refresh();
      } catch (err) {
        setError(parseSshError(err).message);
        throw err;
      }
    },
    [hostId, path, refresh],
  );

  const openEntry = useCallback(
    async (entry: SftpEntry): Promise<OpenedRemoteFile> => {
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
        const raw = await sshSftpRead(hostId, entry.path);
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
    async (entry: SftpEntry, text: string) => {
      const bytes = encodeText(text);
      await sshSftpWrite(hostId, entry.path, bytes);
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
    async (entry: SftpEntry) => {
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
          const raw = await sshSftpRead(hostId, entry.path);
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
      const remote = joinRemotePath(path, name);
      await sshSftpWrite(hostId, remote, data);
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
  }, [hostId, path, refresh]);

  return {
    path,
    entries,
    loading,
    error,
    transfer,
    refresh,
    openDir,
    mkdir,
    removeEntry,
    renameEntry,
    openEntry,
    saveText,
    downloadEntry,
    uploadFile,
    clearTransfer: () => setTransfer(null),
    clearError: () => setError(null),
  };
}
