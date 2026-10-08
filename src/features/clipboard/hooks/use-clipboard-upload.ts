import { useCallback, useRef, useState } from "react";
import { join, tempDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import {
  hostFsMkdir,
  hostFsRemove,
  hostFsWriteChunk,
  parseSshError,
} from "@/features/ssh";
import { toastError } from "@/lib/toast";
import {
  CLIPBOARD_DIR,
  MAX_STAGED_BYTES,
  UPLOAD_CHUNK_BYTES,
  basenameOf,
  stagedFileName,
  stagedRemotePath,
} from "@/features/clipboard/lib/clipboard-names";
import { formatTransferBytes } from "@/features/clipboard/lib/format-bytes";
import { quoteShellPath } from "@/features/clipboard/lib/quote-path";
import type {
  ClipboardPasteTarget,
  ClipboardSource,
  ClipboardUploadState,
} from "@/features/clipboard/types";

export type ClipboardController = ReturnType<typeof useClipboardUpload>;

function isCancelled(runRef: React.MutableRefObject<number>, run: number): boolean {
  return runRef.current !== run;
}

/**
 * Stage dropped/pasted/attached files and paste the resulting paths into
 * the registered shell target. Remote files upload to /tmp/relix-clipboard
 * in chunks with progress; local paths paste directly.
 */
export function useClipboardUpload() {
  const [upload, setUpload] = useState<ClipboardUploadState | null>(null);
  const targetRef = useRef<ClipboardPasteTarget | null>(null);
  const runRef = useRef(0);
  const busyRef = useRef(false);
  const busy = upload?.status === "uploading";

  const setTarget = useCallback((target: ClipboardPasteTarget | null) => {
    targetRef.current = target;
  }, []);

  const cancel = useCallback(() => {
    runRef.current += 1;
  }, []);

  const dismiss = useCallback(() => {
    setUpload((current) => (current?.status === "error" ? null : current));
  }, []);

  const stageSources = useCallback(async (sources: ClipboardSource[]) => {
    const target = targetRef.current;
    if (!target || sources.length === 0 || busyRef.current) return;
    busyRef.current = true;
    try {
      if (target.local) {
        await stageLocal(target, sources);
        return;
      }
      const run = runRef.current + 1;
      runRef.current = run;
      await stageRemote(target, sources, run, runRef, setUpload);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const stageBlobs = useCallback(
    async (files: File[]) => {
      const sources: ClipboardSource[] = [];
      for (const file of files) {
        const data = new Uint8Array(await file.arrayBuffer());
        sources.push({
          kind: "blob",
          name: file.name || "paste.bin",
          size: file.size,
          data,
        });
      }
      await stageSources(sources);
    },
    [stageSources],
  );

  const pickAndStage = useCallback(async () => {
    const target = targetRef.current;
    if (!target || busyRef.current) return;
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: "Attach files",
      });
      if (!selected) return;
      const paths = (Array.isArray(selected) ? selected : [selected]).filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      );
      if (paths.length === 0) return;
      await stageSources(
        paths.map((path) => ({
          kind: "path" as const,
          path,
          name: basenameOf(path),
        })),
      );
    } catch (err) {
      toastError(
        "Could not attach files",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, [stageSources]);

  return { upload, busy: busy ?? false, setTarget, stageSources, stageBlobs, pickAndStage, cancel, dismiss };
}

/**
 * Read a local file for staging, rejecting oversized files after the read.
 */
async function readPathBytes(path: string, name: string): Promise<Uint8Array> {
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_STAGED_BYTES) {
    throw new Error(
      `${name} is too large to paste (${formatTransferBytes(bytes.byteLength)}; max ${formatTransferBytes(MAX_STAGED_BYTES)})`,
    );
  }
  return bytes;
}

/**
 * Remove a partially uploaded remote file without surfacing errors.
 */
async function removeRemoteFile(hostId: string, path: string): Promise<void> {
  try {
    await hostFsRemove(hostId, path, false);
  } catch {
    // best effort cleanup
  }
}

/**
 * Upload one file in chunks, reporting progress. Returns false when cancelled.
 */
async function uploadRemoteFile(
  hostId: string,
  name: string,
  bytes: Uint8Array,
  remotePath: string,
  index: number,
  total: number,
  bytesBase: number,
  bytesTotal: number,
  run: number,
  runRef: React.MutableRefObject<number>,
  setUpload: React.Dispatch<React.SetStateAction<ClipboardUploadState | null>>,
): Promise<boolean> {
  setUpload({
    status: "uploading",
    fileName: name,
    index,
    total,
    bytesSent: bytesBase,
    bytesTotal,
    error: null,
  });
  if (bytes.byteLength === 0) {
    if (isCancelled(runRef, run)) return false;
    await hostFsWriteChunk(hostId, remotePath, new Uint8Array(0), 0, true);
    setUpload((current) =>
      current?.status === "uploading"
        ? { ...current, bytesSent: bytesBase }
        : current,
    );
    return true;
  }
  for (let offset = 0; offset < bytes.byteLength; offset += UPLOAD_CHUNK_BYTES) {
    if (isCancelled(runRef, run)) return false;
    const chunk = bytes.slice(offset, offset + UPLOAD_CHUNK_BYTES);
    await hostFsWriteChunk(hostId, remotePath, chunk, offset, offset === 0);
    const sent = bytesBase + offset + chunk.byteLength;
    setUpload((current) =>
      current?.status === "uploading" ? { ...current, bytesSent: sent } : current,
    );
  }
  return true;
}

/**
 * Stage files on a remote host, then paste the staged paths into the shell.
 */
async function stageRemote(
  target: ClipboardPasteTarget,
  sources: ClipboardSource[],
  run: number,
  runRef: React.MutableRefObject<number>,
  setUpload: React.Dispatch<React.SetStateAction<ClipboardUploadState | null>>,
): Promise<void> {
  try {
    const items: Array<{ name: string; bytes: Uint8Array }> = [];
    for (const source of sources) {
      const bytes =
        source.kind === "path"
          ? await readPathBytes(source.path, source.name)
          : source.data;
      if (bytes.byteLength > MAX_STAGED_BYTES) {
        throw new Error(
          `${source.name} is too large to paste (${formatTransferBytes(bytes.byteLength)}; max ${formatTransferBytes(MAX_STAGED_BYTES)})`,
        );
      }
      items.push({ name: source.name, bytes });
    }
    if (isCancelled(runRef, run)) {
      setUpload(null);
      return;
    }
    const bytesTotal = items.reduce((sum, item) => sum + item.bytes.byteLength, 0);
    await hostFsMkdir(target.hostId, CLIPBOARD_DIR).catch(() => undefined);

    const staged: string[] = [];
    let sent = 0;
    for (let i = 0; i < items.length; i += 1) {
      if (isCancelled(runRef, run)) {
        setUpload(null);
        return;
      }
      const remotePath = stagedRemotePath(items[i].name);
      const done = await uploadRemoteFile(
        target.hostId,
        items[i].name,
        items[i].bytes,
        remotePath,
        i + 1,
        items.length,
        sent,
        bytesTotal,
        run,
        runRef,
        setUpload,
      );
      if (!done) {
        await removeRemoteFile(target.hostId, remotePath);
        setUpload(null);
        return;
      }
      sent += items[i].bytes.byteLength;
      staged.push(remotePath);
    }
    setUpload(null);
    target.send(staged.map(quoteShellPath).join(" "));
  } catch (err) {
    if (isCancelled(runRef, run)) {
      setUpload(null);
      return;
    }
    const message = parseSshError(err).message;
    setUpload((current) =>
      current
        ? { ...current, status: "error", error: message }
        : {
            status: "error",
            fileName: sources[0]?.name ?? "file",
            index: 1,
            total: sources.length,
            bytesSent: 0,
            bytesTotal: 0,
            error: message,
          },
    );
  }
}

/**
 * Paste local files directly; pathless blobs are saved to the OS temp dir.
 */
async function stageLocal(
  target: ClipboardPasteTarget,
  sources: ClipboardSource[],
): Promise<void> {
  try {
    const paths: string[] = [];
    for (const source of sources) {
      if (source.kind === "path") {
        paths.push(source.path);
        continue;
      }
      if (source.data.byteLength > MAX_STAGED_BYTES) {
        throw new Error(
          `${source.name} is too large to paste (${formatTransferBytes(source.data.byteLength)}; max ${formatTransferBytes(MAX_STAGED_BYTES)})`,
        );
      }
      const dest = await join(await tempDir(), `relix-clipboard-${stagedFileName(source.name)}`);
      await writeFile(dest, source.data);
      paths.push(dest);
    }
    target.send(paths.map(quoteShellPath).join(" "));
  } catch (err) {
    toastError(
      "Could not paste file",
      err instanceof Error ? err.message : undefined,
    );
  }
}
