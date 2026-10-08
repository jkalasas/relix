/**
 * A file dropped from the OS, picked via the system dialog, or pasted
 * from the clipboard, ready to be staged and pasted into a shell.
 */
export type ClipboardSource =
  | { kind: "path"; path: string; name: string }
  | { kind: "blob"; name: string; size: number; data: Uint8Array };

/** Live shell input that receives pasted paths. */
export type ClipboardPasteTarget = {
  hostId: string;
  local: boolean;
  send: (text: string) => void;
};

export type ClipboardUploadStatus = "uploading" | "error";

export type ClipboardUploadState = {
  status: ClipboardUploadStatus;
  fileName: string;
  index: number;
  total: number;
  bytesSent: number;
  bytesTotal: number;
  error: string | null;
};
