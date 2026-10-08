import type { OpenedFile } from "@/features/files";

export type SessionTab =
  | { id: string; kind: "shell"; shellId: string }
  | { id: string; kind: "file"; path: string; name: string };

export type SessionTabKind = SessionTab["kind"];

export type OpenFileState =
  | { status: "loading"; path: string; name: string }
  | {
      status: "ready";
      path: string;
      name: string;
      file: OpenedFile;
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

/** Env var exported into every shell PTY with the owning tab's id. */
export const RELIX_TAB_ENV = "_RELIX_TAB_ID";

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
