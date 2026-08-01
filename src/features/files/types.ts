import type { FsEntry } from "@/features/ssh";
import type { FileKind } from "@/features/files/lib/file-kind";

export type FileTransferKind = "upload" | "download";

export type FileTransferState = {
  kind: FileTransferKind;
  name: string;
  busy: boolean;
  error: string | null;
};

export type OpenedFile = {
  entry: FsEntry;
  kind: FileKind;
  bytes: Uint8Array;
  text: string | null;
};
