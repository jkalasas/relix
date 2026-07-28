import { useCallback, useRef, useState } from "react";
import {
  downloadRemoteFile,
  openRemoteFile,
  saveRemoteText,
} from "@/features/sftp/remote-file";
import type { SftpEntry } from "@/features/ssh";
import { parseSshError } from "@/features/ssh/errors";
import {
  FILES_TAB_ID,
  PORTS_TAB_ID,
  fileTabId,
  shellTabId,
  type OpenFileState,
  type SessionTab,
} from "@/features/session-tabs/types";

function neighborId(tabs: SessionTab[], removedId: string): string | null {
  const index = tabs.findIndex((tab) => tab.id === removedId);
  if (index < 0) return tabs[0]?.id ?? null;
  return tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? null;
}

function dropTab(
  tabs: SessionTab[],
  tabId: string,
): { tabs: SessionTab[]; removed: SessionTab | null } {
  const removed = tabs.find((tab) => tab.id === tabId) ?? null;
  return {
    tabs: tabs.filter((tab) => tab.id !== tabId),
    removed,
  };
}

export function useSessionTabs() {
  const [tabsByHost, setTabsByHost] = useState<Record<string, SessionTab[]>>(
    {},
  );
  const [activeTabByHost, setActiveTabByHost] = useState<
    Record<string, string | null>
  >({});
  const [filesByHost, setFilesByHost] = useState<
    Record<string, Record<string, OpenFileState>>
  >({});

  const tabsByHostRef = useRef(tabsByHost);
  tabsByHostRef.current = tabsByHost;
  const activeTabByHostRef = useRef(activeTabByHost);
  activeTabByHostRef.current = activeTabByHost;
  const filesByHostRef = useRef(filesByHost);
  filesByHostRef.current = filesByHost;

  const selectTab = useCallback((hostId: string, tabId: string) => {
    setActiveTabByHost((current) => {
      if (current[hostId] === tabId) return current;
      return { ...current, [hostId]: tabId };
    });
  }, []);

  const activateIfNeeded = useCallback((hostId: string, tabId: string) => {
    setActiveTabByHost((current) => ({ ...current, [hostId]: tabId }));
  }, []);

  const syncShellTabs = useCallback((hostId: string, shellIds: string[]) => {
    const shellIdSet = new Set(shellIds);
    setTabsByHost((current) => {
      const existing = current[hostId] ?? [];
      let next = existing.filter(
        (tab) => tab.kind !== "shell" || shellIdSet.has(tab.shellId),
      );
      const present = new Set(
        next.filter((tab) => tab.kind === "shell").map((tab) => tab.shellId),
      );
      for (const shellId of shellIds) {
        if (present.has(shellId)) continue;
        next = [
          ...next,
          { id: shellTabId(shellId), kind: "shell", shellId },
        ];
      }

      const same =
        next.length === existing.length &&
        next.every((tab, index) => {
          const prev = existing[index];
          if (!prev || prev.id !== tab.id || prev.kind !== tab.kind) return false;
          if (tab.kind === "shell" && prev.kind === "shell") {
            return tab.shellId === prev.shellId;
          }
          return true;
        });
      if (same) return current;
      return { ...current, [hostId]: next };
    });

    setActiveTabByHost((current) => {
      const activeId = current[hostId];
      if (!activeId) {
        const firstShell = shellIds[0];
        if (!firstShell) return current;
        return { ...current, [hostId]: shellTabId(firstShell) };
      }
      if (!activeId.startsWith("shell:")) return current;
      const shellId = activeId.slice("shell:".length);
      if (shellIdSet.has(shellId)) return current;
      const tabs = (tabsByHostRef.current[hostId] ?? []).filter(
        (tab) => tab.kind !== "shell" || shellIdSet.has(tab.shellId),
      );
      const fallbackShell = shellIds[0];
      const nextActive =
        tabs.find((tab) => tab.id !== activeId)?.id ??
        (fallbackShell ? shellTabId(fallbackShell) : null);
      return { ...current, [hostId]: nextActive };
    });
  }, []);

  const activateShellTab = useCallback((hostId: string, shellId: string) => {
    const id = shellTabId(shellId);
    setTabsByHost((current) => {
      const existing = current[hostId] ?? [];
      if (existing.some((tab) => tab.id === id)) return current;
      return {
        ...current,
        [hostId]: [...existing, { id, kind: "shell", shellId }],
      };
    });
    setActiveTabByHost((current) => ({ ...current, [hostId]: id }));
  }, []);

  const openToolTab = useCallback(
    (hostId: string, kind: "files" | "ports") => {
      const id = kind === "files" ? FILES_TAB_ID : PORTS_TAB_ID;
      setTabsByHost((current) => {
        const existing = current[hostId] ?? [];
        if (existing.some((tab) => tab.id === id)) return current;
        return {
          ...current,
          [hostId]: [...existing, { id, kind }],
        };
      });
      setActiveTabByHost((current) => ({ ...current, [hostId]: id }));
    },
    [],
  );

  const openFileTab = useCallback(
    async (hostId: string, entry: SftpEntry) => {
      if (entry.isDir) return;
      const id = fileTabId(entry.path);
      const existingFile = filesByHostRef.current[hostId]?.[entry.path];

      setTabsByHost((current) => {
        const existing = current[hostId] ?? [];
        if (existing.some((tab) => tab.id === id)) return current;
        return {
          ...current,
          [hostId]: [
            ...existing,
            { id, kind: "file", path: entry.path, name: entry.name },
          ],
        };
      });
      setActiveTabByHost((current) => ({ ...current, [hostId]: id }));

      if (existingFile?.status === "ready" && !existingFile.dirty) {
        // still refresh if fingerprint may have changed — reload below
      }

      if (existingFile?.status === "ready" && existingFile.dirty) {
        return;
      }

      setFilesByHost((current) => ({
        ...current,
        [hostId]: {
          ...(current[hostId] ?? {}),
          [entry.path]: {
            status: "loading",
            path: entry.path,
            name: entry.name,
          },
        },
      }));

      try {
        const file = await openRemoteFile(hostId, entry);
        setFilesByHost((current) => ({
          ...current,
          [hostId]: {
            ...(current[hostId] ?? {}),
            [entry.path]: {
              status: "ready",
              path: entry.path,
              name: entry.name,
              file,
              text: file.text ?? "",
              dirty: false,
            },
          },
        }));
      } catch (err) {
        setFilesByHost((current) => ({
          ...current,
          [hostId]: {
            ...(current[hostId] ?? {}),
            [entry.path]: {
              status: "error",
              path: entry.path,
              name: entry.name,
              message: parseSshError(err).message,
            },
          },
        }));
      }
    },
    [],
  );

  const setFileText = useCallback(
    (hostId: string, path: string, text: string) => {
      setFilesByHost((current) => {
        const file = current[hostId]?.[path];
        if (!file || file.status !== "ready") return current;
        const dirty = text !== (file.file.text ?? "");
        if (file.text === text && file.dirty === dirty) return current;
        return {
          ...current,
          [hostId]: {
            ...current[hostId],
            [path]: { ...file, text, dirty },
          },
        };
      });
    },
    [],
  );

  const saveFile = useCallback(async (hostId: string, path: string) => {
    const state = filesByHostRef.current[hostId]?.[path];
    if (!state || state.status !== "ready" || state.file.kind !== "text") {
      return;
    }
    try {
      await saveRemoteText(hostId, state.file.entry, state.text);
      const bytes = new TextEncoder().encode(state.text);
      setFilesByHost((current) => {
        const file = current[hostId]?.[path];
        if (!file || file.status !== "ready") return current;
        return {
          ...current,
          [hostId]: {
            ...current[hostId],
            [path]: {
              ...file,
              dirty: false,
              text: file.text,
              file: {
                ...file.file,
                text: file.text,
                bytes,
                entry: {
                  ...file.file.entry,
                  size: bytes.byteLength,
                  mtime: null,
                },
              },
            },
          },
        };
      });
    } catch (err) {
      throw err;
    }
  }, []);

  const downloadFile = useCallback(async (hostId: string, path: string) => {
    const state = filesByHostRef.current[hostId]?.[path];
    if (!state) return;
    if (state.status === "ready") {
      await downloadRemoteFile(hostId, state.file.entry);
      return;
    }
    if (state.status === "error") {
      await downloadRemoteFile(hostId, {
        name: state.name,
        path: state.path,
        isDir: false,
        size: 0,
        mtime: null,
      });
    }
  }, []);

  const closeTab = useCallback(
    (hostId: string, tabId: string, options?: { force?: boolean }) => {
      const tabs = tabsByHostRef.current[hostId] ?? [];
      const tab = tabs.find((item) => item.id === tabId);
      if (!tab) return { closed: true as const };

      if (tab.kind === "file" && !options?.force) {
        const file = filesByHostRef.current[hostId]?.[tab.path];
        if (file?.status === "ready" && file.dirty) {
          return { closed: false as const, dirty: true as const, tab };
        }
      }

      const { tabs: nextTabs } = dropTab(tabs, tabId);
      setTabsByHost((current) => ({ ...current, [hostId]: nextTabs }));

      if (tab.kind === "file") {
        setFilesByHost((current) => {
          const hostFiles = { ...(current[hostId] ?? {}) };
          delete hostFiles[tab.path];
          return { ...current, [hostId]: hostFiles };
        });
      }

      setActiveTabByHost((current) => {
        if (current[hostId] !== tabId) return current;
        return {
          ...current,
          [hostId]: neighborId(tabs, tabId),
        };
      });

      return {
        closed: true as const,
        tab,
      };
    },
    [],
  );

  const reorderTabs = useCallback((hostId: string, orderedIds: string[]) => {
    setTabsByHost((current) => {
      const list = current[hostId] ?? [];
      if (list.length <= 1) return current;
      const byId = new Map(list.map((tab) => [tab.id, tab]));
      const next: SessionTab[] = [];
      for (const id of orderedIds) {
        const tab = byId.get(id);
        if (!tab) continue;
        next.push(tab);
        byId.delete(id);
      }
      for (const tab of list) {
        if (byId.has(tab.id)) next.push(tab);
      }
      if (
        next.length === list.length &&
        next.every((tab, index) => tab.id === list[index]?.id)
      ) {
        return current;
      }
      return { ...current, [hostId]: next };
    });
  }, []);

  const clearHost = useCallback((hostId: string) => {
    setTabsByHost((current) => ({ ...current, [hostId]: [] }));
    setActiveTabByHost((current) => ({ ...current, [hostId]: null }));
    setFilesByHost((current) => ({ ...current, [hostId]: {} }));
  }, []);

  const removeHost = useCallback((hostId: string) => {
    setTabsByHost((current) => {
      const next = { ...current };
      delete next[hostId];
      return next;
    });
    setActiveTabByHost((current) => {
      const next = { ...current };
      delete next[hostId];
      return next;
    });
    setFilesByHost((current) => {
      const next = { ...current };
      delete next[hostId];
      return next;
    });
  }, []);

  return {
    tabsByHost,
    activeTabByHost,
    filesByHost,
    selectTab,
    activateIfNeeded,
    syncShellTabs,
    activateShellTab,
    openToolTab,
    openFileTab,
    setFileText,
    saveFile,
    downloadFile,
    closeTab,
    reorderTabs,
    clearHost,
    removeHost,
  };
}
