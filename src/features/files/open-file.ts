import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { hostFsRead, hostFsWrite } from "@/features/ssh";
import type { FsEntry } from "@/features/ssh";
import {
  cacheGet,
  cachePut,
  cacheUpdateText,
} from "@/features/files/file-cache";
import {
  classifyFile,
  decodeText,
  encodeText,
} from "@/features/files/file-kind";
import type { OpenedFile } from "@/features/files/types";

function fingerprintOf(entry: FsEntry) {
  return { size: entry.size, mtime: entry.mtime ?? null };
}

function bytesFromInvoke(data: number[]): Uint8Array {
  return Uint8Array.from(data);
}

export async function openFile(
  hostId: string,
  entry: FsEntry,
): Promise<OpenedFile> {
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
}

export async function saveText(
  hostId: string,
  entry: FsEntry,
  text: string,
): Promise<void> {
  const bytes = encodeText(text);
  await hostFsWrite(hostId, entry.path, bytes);
  cacheUpdateText(hostId, entry.path, text, bytes, {
    size: bytes.byteLength,
    mtime: null,
  });
}

export async function downloadFile(
  hostId: string,
  entry: FsEntry,
): Promise<void> {
  if (entry.isDir) return;

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
  if (!destination) return;
  await writeFile(destination, bytes);
}
