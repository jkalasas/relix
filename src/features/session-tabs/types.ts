import type { OpenedRemoteFile } from "@/features/sftp/use-sftp";

export type SessionTab =
  | { id: string; kind: "shell"; shellId: string }
  | { id: string; kind: "file"; path: string; name: string }
  | { id: string; kind: "files" }
  | { id: string; kind: "ports" };

export type SessionTabKind = SessionTab["kind"];

export type OpenFileState =
  | { status: "loading"; path: string; name: string }
  | {
      status: "ready";
      path: string;
      name: string;
      file: OpenedRemoteFile;
      text: string;
      dirty: boolean;
    }
  | { status: "error"; path: string; name: string; message: string };

export function shellTabId(shellId: string): string {
  return `shell:${shellId}`;
}

export function fileTabId(path: string): string {
  return `file:${path}`;
}

export const FILES_TAB_ID = "files";
export const PORTS_TAB_ID = "ports";

export function isShellTab(
  tab: SessionTab,
): tab is Extract<SessionTab, { kind: "shell" }> {
  return tab.kind === "shell";
}

export function isFileTab(
  tab: SessionTab,
): tab is Extract<SessionTab, { kind: "file" }> {
  return tab.kind === "file";
}
