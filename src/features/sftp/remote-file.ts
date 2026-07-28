import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sshSftpRead, sshSftpWrite } from "@/features/ssh";
import type { SftpEntry } from "@/features/ssh";
import {
  cacheGet,
  cachePut,
  cacheUpdateText,
} from "@/features/sftp/file-cache";
import {
  classifyFile,
  decodeText,
  encodeText,
} from "@/features/sftp/file-kind";
import type { OpenedRemoteFile } from "@/features/sftp/use-sftp";

function fingerprintOf(entry: SftpEntry) {
  return { size: entry.size, mtime: entry.mtime ?? null };
}

function bytesFromInvoke(data: number[]): Uint8Array {
  return Uint8Array.from(data);
}

export async function openRemoteFile(
  hostId: string,
  entry: SftpEntry,
): Promise<OpenedRemoteFile> {
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
}

export async function saveRemoteText(
  hostId: string,
  entry: SftpEntry,
  text: string,
): Promise<void> {
  const bytes = encodeText(text);
  await sshSftpWrite(hostId, entry.path, bytes);
  cacheUpdateText(hostId, entry.path, text, bytes, {
    size: bytes.byteLength,
    mtime: null,
  });
}

export async function downloadRemoteFile(
  hostId: string,
  entry: SftpEntry,
): Promise<void> {
  if (entry.isDir) return;

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
  if (!destination) return;
  await writeFile(destination, bytes);
}
