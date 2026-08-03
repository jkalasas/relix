import { useCallback, useRef, useState } from "react";
import {
  downloadFile as downloadHostFile,
  openFile,
  saveText,
} from "@/features/files";
import type { FsEntry } from "@/features/ssh";
import { parseSshError } from "@/features/ssh";
import {
  dropTab,
  neighborId,
  workspaceIdsForHost,
} from "@/features/session-tabs/lib/tab-ops";
import {
  FILES_TAB_ID,
  GIT_TAB_ID,
  PORTS_TAB_ID,
  fileTabId,
  shellTabId,
  type OpenFileState,
  type SessionTab,
} from "@/features/session-tabs/types";

export function useSessionTabs() {
  const [tabsByWorkspace, setTabsByWorkspace] = useState<
    Record<string, SessionTab[]>
  >({});
  const [activeTabByWorkspace, setActiveTabByWorkspace] = useState<
    Record<string, string | null>
  >({});
  const [filesByWorkspace, setFilesByWorkspace] = useState<
    Record<string, Record<string, OpenFileState>>
  >({});

  const tabsByWorkspaceRef = useRef(tabsByWorkspace);
  tabsByWorkspaceRef.current = tabsByWorkspace;
  const activeTabByWorkspaceRef = useRef(activeTabByWorkspace);
  activeTabByWorkspaceRef.current = activeTabByWorkspace;
  const filesByWorkspaceRef = useRef(filesByWorkspace);
  filesByWorkspaceRef.current = filesByWorkspace;

  const selectTab = useCallback((workspaceId: string, tabId: string) => {
    setActiveTabByWorkspace((current) => {
      if (current[workspaceId] === tabId) return current;
      return { ...current, [workspaceId]: tabId };
    });
  }, []);

  const syncShellTabs = useCallback(
    (workspaceId: string, shellIds: string[]) => {
      const shellIdSet = new Set(shellIds);
      setTabsByWorkspace((current) => {
        const existing = current[workspaceId] ?? [];
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
            if (!prev || prev.id !== tab.id || prev.kind !== tab.kind) {
              return false;
            }
            if (tab.kind === "shell" && prev.kind === "shell") {
              return tab.shellId === prev.shellId;
            }
            return true;
          });
        if (same) return current;
        return { ...current, [workspaceId]: next };
      });

      setActiveTabByWorkspace((current) => {
        const activeId = current[workspaceId];
        if (!activeId) {
          const firstShell = shellIds[0];
          if (!firstShell) return current;
          return { ...current, [workspaceId]: shellTabId(firstShell) };
        }
        if (!activeId.startsWith("shell:")) return current;
        const shellId = activeId.slice("shell:".length);
        if (shellIdSet.has(shellId)) return current;
        const tabs = (tabsByWorkspaceRef.current[workspaceId] ?? []).filter(
          (tab) => tab.kind !== "shell" || shellIdSet.has(tab.shellId),
        );
        const fallbackShell = shellIds[0];
        const nextActive =
          tabs.find((tab) => tab.id !== activeId)?.id ??
          (fallbackShell ? shellTabId(fallbackShell) : null);
        return { ...current, [workspaceId]: nextActive };
      });
    },
    [],
  );

  const activateShellTab = useCallback(
    (workspaceId: string, shellId: string) => {
      const id = shellTabId(shellId);
      setTabsByWorkspace((current) => {
        const existing = current[workspaceId] ?? [];
        if (existing.some((tab) => tab.id === id)) return current;
        return {
          ...current,
          [workspaceId]: [...existing, { id, kind: "shell", shellId }],
        };
      });
      setActiveTabByWorkspace((current) => ({
        ...current,
        [workspaceId]: id,
      }));
    },
    [],
  );

  const openToolTab = useCallback(
    (workspaceId: string, kind: "files" | "ports" | "git") => {
      const id =
        kind === "files"
          ? FILES_TAB_ID
          : kind === "ports"
            ? PORTS_TAB_ID
            : GIT_TAB_ID;
      setTabsByWorkspace((current) => {
        const existing = current[workspaceId] ?? [];
        if (existing.some((tab) => tab.id === id)) return current;
        return {
          ...current,
          [workspaceId]: [...existing, { id, kind }],
        };
      });
      setActiveTabByWorkspace((current) => ({
        ...current,
        [workspaceId]: id,
      }));
    },
    [],
  );

  const openFileTab = useCallback(
    async (workspaceId: string, hostId: string, entry: FsEntry) => {
      if (entry.isDir) return;
      const id = fileTabId(entry.path);
      const existingFile = filesByWorkspaceRef.current[workspaceId]?.[entry.path];

      setTabsByWorkspace((current) => {
        const existing = current[workspaceId] ?? [];
        if (existing.some((tab) => tab.id === id)) return current;
        return {
          ...current,
          [workspaceId]: [
            ...existing,
            { id, kind: "file", path: entry.path, name: entry.name },
          ],
        };
      });
      setActiveTabByWorkspace((current) => ({
        ...current,
        [workspaceId]: id,
      }));

      if (existingFile?.status === "ready" && existingFile.dirty) {
        return;
      }

      setFilesByWorkspace((current) => ({
        ...current,
        [workspaceId]: {
          ...(current[workspaceId] ?? {}),
          [entry.path]: {
            status: "loading",
            path: entry.path,
            name: entry.name,
          },
        },
      }));

      try {
        const file = await openFile(hostId, entry);
        setFilesByWorkspace((current) => ({
          ...current,
          [workspaceId]: {
            ...(current[workspaceId] ?? {}),
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
        setFilesByWorkspace((current) => ({
          ...current,
          [workspaceId]: {
            ...(current[workspaceId] ?? {}),
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
    (workspaceId: string, path: string, text: string) => {
      setFilesByWorkspace((current) => {
        const file = current[workspaceId]?.[path];
        if (!file || file.status !== "ready") return current;
        const dirty = text !== (file.file.text ?? "");
        if (file.text === text && file.dirty === dirty) return current;
        return {
          ...current,
          [workspaceId]: {
            ...current[workspaceId],
            [path]: { ...file, text, dirty },
          },
        };
      });
    },
    [],
  );

  const saveFile = useCallback(async (workspaceId: string, hostId: string, path: string) => {
    const state = filesByWorkspaceRef.current[workspaceId]?.[path];
    if (!state || state.status !== "ready" || state.file.kind !== "text") {
      return;
    }
    await saveText(hostId, state.file.entry, state.text);
    const bytes = new TextEncoder().encode(state.text);
    setFilesByWorkspace((current) => {
      const file = current[workspaceId]?.[path];
      if (!file || file.status !== "ready") return current;
      return {
        ...current,
        [workspaceId]: {
          ...current[workspaceId],
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
  }, []);

  const downloadFile = useCallback(
    async (workspaceId: string, hostId: string, path: string) => {
      const state = filesByWorkspaceRef.current[workspaceId]?.[path];
      if (!state) return;
      if (state.status === "ready") {
        await downloadHostFile(hostId, state.file.entry);
        return;
      }
      if (state.status === "error") {
        await downloadHostFile(hostId, {
          name: state.name,
          path: state.path,
          isDir: false,
          size: 0,
          mtime: null,
        });
      }
    },
    [],
  );

  const closeTab = useCallback(
    (workspaceId: string, tabId: string, options?: { force?: boolean }) => {
      const tabs = tabsByWorkspaceRef.current[workspaceId] ?? [];
      const tab = tabs.find((item) => item.id === tabId);
      if (!tab) return { closed: true as const };

      if (tab.kind === "file" && !options?.force) {
        const file = filesByWorkspaceRef.current[workspaceId]?.[tab.path];
        if (file?.status === "ready" && file.dirty) {
          return { closed: false as const, dirty: true as const, tab };
        }
      }

      const { tabs: nextTabs } = dropTab(tabs, tabId);
      setTabsByWorkspace((current) => ({
        ...current,
        [workspaceId]: nextTabs,
      }));

      if (tab.kind === "file") {
        setFilesByWorkspace((current) => {
          const hostFiles = { ...(current[workspaceId] ?? {}) };
          delete hostFiles[tab.path];
          return { ...current, [workspaceId]: hostFiles };
        });
      }

      setActiveTabByWorkspace((current) => {
        if (current[workspaceId] !== tabId) return current;
        return {
          ...current,
          [workspaceId]: neighborId(tabs, tabId),
        };
      });

      return {
        closed: true as const,
        tab,
      };
    },
    [],
  );

  const reorderTabs = useCallback(
    (workspaceId: string, orderedIds: string[]) => {
      setTabsByWorkspace((current) => {
        const list = current[workspaceId] ?? [];
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
        return { ...current, [workspaceId]: next };
      });
    },
    [],
  );

  const clearWorkspace = useCallback((workspaceId: string) => {
    setTabsByWorkspace((current) => ({ ...current, [workspaceId]: [] }));
    setActiveTabByWorkspace((current) => ({
      ...current,
      [workspaceId]: null,
    }));
    setFilesByWorkspace((current) => ({ ...current, [workspaceId]: {} }));
  }, []);

  const clearHost = useCallback((hostId: string) => {
    const workspaceIds = workspaceIdsForHost(tabsByWorkspaceRef.current, hostId);
    const fileWorkspaceIds = workspaceIdsForHost(
      filesByWorkspaceRef.current,
      hostId,
    );
    const activeWorkspaceIds = workspaceIdsForHost(
      activeTabByWorkspaceRef.current,
      hostId,
    );
    const ids = new Set([
      ...workspaceIds,
      ...fileWorkspaceIds,
      ...activeWorkspaceIds,
    ]);

    setTabsByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of ids) {
        next[workspaceId] = [];
      }
      return next;
    });
    setActiveTabByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of ids) {
        next[workspaceId] = null;
      }
      return next;
    });
    setFilesByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of ids) {
        next[workspaceId] = {};
      }
      return next;
    });
  }, []);

  const removeHost = useCallback((hostId: string) => {
    setTabsByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdsForHost(next, hostId)) {
        delete next[workspaceId];
      }
      return next;
    });
    setActiveTabByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdsForHost(next, hostId)) {
        delete next[workspaceId];
      }
      return next;
    });
    setFilesByWorkspace((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdsForHost(next, hostId)) {
        delete next[workspaceId];
      }
      return next;
    });
  }, []);

  const removeWorkspace = useCallback((workspaceId: string) => {
    setTabsByWorkspace((current) => {
      if (!(workspaceId in current)) return current;
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
    setActiveTabByWorkspace((current) => {
      if (!(workspaceId in current)) return current;
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
    setFilesByWorkspace((current) => {
      if (!(workspaceId in current)) return current;
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
  }, []);

  const moveWorkspace = useCallback(
    (fromWorkspaceId: string, toWorkspaceId: string) => {
      if (fromWorkspaceId === toWorkspaceId) return;

      setTabsByWorkspace((current) => {
        const from = current[fromWorkspaceId] ?? [];
        if (from.length === 0 && !(fromWorkspaceId in current)) return current;
        const next = { ...current };
        delete next[fromWorkspaceId];
        const existing = next[toWorkspaceId] ?? [];
        const existingIds = new Set(existing.map((tab) => tab.id));
        next[toWorkspaceId] = [
          ...existing,
          ...from.filter((tab) => !existingIds.has(tab.id)),
        ];
        return next;
      });

      setActiveTabByWorkspace((current) => {
        const next = { ...current };
        const fromActive = next[fromWorkspaceId] ?? null;
        delete next[fromWorkspaceId];
        if (!next[toWorkspaceId] && fromActive) {
          next[toWorkspaceId] = fromActive;
        }
        return next;
      });

      setFilesByWorkspace((current) => {
        const from = current[fromWorkspaceId] ?? {};
        if (Object.keys(from).length === 0 && !(fromWorkspaceId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[fromWorkspaceId];
        next[toWorkspaceId] = {
          ...(next[toWorkspaceId] ?? {}),
          ...from,
        };
        return next;
      });
    },
    [],
  );

  return {
    tabsByWorkspace,
    activeTabByWorkspace,
    filesByWorkspace,
    selectTab,
    syncShellTabs,
    activateShellTab,
    openToolTab,
    openFileTab,
    setFileText,
    saveFile,
    downloadFile,
    closeTab,
    reorderTabs,
    clearWorkspace,
    clearHost,
    removeHost,
    removeWorkspace,
    moveWorkspace,
  };
}
