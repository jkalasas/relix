export type FileTransferKind = "upload" | "download";

export type FileTransferState = {
  kind: FileTransferKind;
  name: string;
  busy: boolean;
  error: string | null;
};
