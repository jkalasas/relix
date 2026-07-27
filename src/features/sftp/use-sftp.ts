import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import {
  sshSftpList,
  sshSftpMkdir,
  sshSftpRead,
  sshSftpRemove,
  sshSftpWrite,
} from "@/features/ssh";
import type { SftpEntry } from "@/features/ssh";
import { parseSshError } from "@/features/ssh/errors";
import { basename, joinRemotePath } from "@/features/sftp/format";
import type { SftpTransferState } from "@/features/sftp/types";

type UseSftpOptions = {
  hostId: string;
  connected: boolean;
};

export function useSftp({ hostId, connected }: UseSftpOptions) {
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
      return;
    }
    void refresh(".");
    // only re-list when connection or host changes
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
      const label = entry.isDir ? "directory" : "file";
      if (!window.confirm(`Delete ${label} ${entry.name}?`)) return;
      try {
        await sshSftpRemove(hostId, entry.path, entry.isDir);
        await refresh();
      } catch (err) {
        setError(parseSshError(err).message);
      }
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
        const bytes = await sshSftpRead(hostId, entry.path);
        const destination = await save({
          defaultPath: entry.name,
          title: "Save file",
        });
        if (!destination) {
          setTransfer(null);
          return;
        }
        await writeFile(destination, Uint8Array.from(bytes));
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
    downloadEntry,
    uploadFile,
    clearTransfer: () => setTransfer(null),
  };
}
