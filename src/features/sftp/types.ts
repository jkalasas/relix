export type SftpTransferKind = "upload" | "download";

export type SftpTransferState = {
  kind: SftpTransferKind;
  name: string;
  busy: boolean;
  error: string | null;
};
