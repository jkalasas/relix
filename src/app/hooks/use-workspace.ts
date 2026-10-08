import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppPage, ForwardFormMode } from "@/app/types";
import {
  normalizeWorktreePath,
  parseWorkspaceId,
  toWorkspaceId,
  type WorkspaceId,
  type WorkspaceRef,
  type WorkspaceScope,
} from "@/features/projects";

type UseWorkspaceOptions = {
  onShortcutFiles?: () => void;
  onShortcutPorts?: () => void;
  onShortcutShell?: () => void;
  onShortcutGit?: () => void;
};

function pageWorkspaceId(page: AppPage): WorkspaceId | null {
  if (page.name !== "workspace") return null;
  return toWorkspaceId({ hostId: page.hostId, scope: page.scope });
}

export type SidePanelTab = "files" | "git" | "ports";

const PANEL_TAB_KEY = "relix.sidepanel-tab";
const PANEL_COLLAPSED_KEY = "relix.sidepanel-collapsed";

function readPanelTab(): SidePanelTab {
  try {
    const raw = localStorage.getItem(PANEL_TAB_KEY);
    if (raw === "git" || raw === "ports" || raw === "files") return raw;
  } catch {
    // ignore
  }
  return "files";
}

function readPanelCollapsed(): boolean {
  try {
    return localStorage.getItem(PANEL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function useWorkspace({
  onShortcutFiles,
  onShortcutPorts,
  onShortcutShell,
  onShortcutGit,
}: UseWorkspaceOptions) {
  const [page, setPage] = useState<AppPage>({ name: "hosts" });
  const [forwardFormMode, setForwardFormMode] = useState<ForwardFormMode>(null);
  const [recents, setRecents] = useState<WorkspaceRef[]>([]);
  const [panelTab, setPanelTabState] = useState<SidePanelTab>(readPanelTab);
  const [panelCollapsed, setPanelCollapsedState] = useState(readPanelCollapsed);
  const [mobileTool, setMobileTool] = useState<SidePanelTab | null>(null);

  const workspaceId = useMemo(() => pageWorkspaceId(page), [page]);

  const hostId =
    page.name === "hosts"
      ? null
      : page.name === "host-form"
        ? (page.hostId ?? null)
        : page.hostId;

  const rememberWorkspace = useCallback((ref: WorkspaceRef) => {
    setRecents((current) => {
      const id = toWorkspaceId(ref);
      if (current.some((item) => toWorkspaceId(item) === id)) {
        return current;
      }
      return [...current, ref].slice(0, 12);
    });
  }, []);

  const reorderRecents = useCallback((orderedIds: string[]) => {
    setRecents((current) => {
      if (orderedIds.length === 0) return current;
      const byId = new Map(
        current.map((item) => [toWorkspaceId(item), item] as const),
      );
      const next: WorkspaceRef[] = [];
      for (const id of orderedIds) {
        const item = byId.get(id);
        if (!item) continue;
        next.push(item);
        byId.delete(id);
      }
      for (const item of current) {
        if (byId.has(toWorkspaceId(item))) next.push(item);
      }
      if (
        next.length === current.length &&
        next.every((item, index) => item === current[index])
      ) {
        return current;
      }
      return next;
    });
  }, []);

  const openHosts = useCallback(() => {
    setPage({ name: "hosts" });
    setForwardFormMode(null);
    setMobileTool(null);
  }, []);

  const openProjects = useCallback((nextHostId: string) => {
    setPage({ name: "projects", hostId: nextHostId });
    setForwardFormMode(null);
    setMobileTool(null);
  }, []);

  const openWorkspace = useCallback(
    (nextHostId: string, scope: WorkspaceScope) => {
      let nextScope: WorkspaceScope;
      if (scope.kind === "project") {
        const worktree = normalizeWorktreePath(scope.worktreePath);
        nextScope = worktree
          ? { kind: "project", projectId: scope.projectId, worktreePath: worktree }
          : { kind: "project", projectId: scope.projectId };
      } else {
        nextScope = { kind: "adhoc" };
      }
      const ref = { hostId: nextHostId, scope: nextScope };
      rememberWorkspace(ref);
      setPage({
        name: "workspace",
        hostId: nextHostId,
        scope: nextScope,
      });
      setForwardFormMode(null);
      setMobileTool(null);
    },
    [rememberWorkspace],
  );

  const openAdhoc = useCallback(
    (nextHostId: string) => {
      openWorkspace(nextHostId, { kind: "adhoc" });
    },
    [openWorkspace],
  );

  const openProject = useCallback(
    (nextHostId: string, projectId: string, worktreePath?: string | null) => {
      openWorkspace(nextHostId, { kind: "project", projectId, worktreePath });
    },
    [openWorkspace],
  );

  const openRecent = useCallback(
    (ref: WorkspaceRef) => {
      openWorkspace(ref.hostId, ref.scope);
    },
    [openWorkspace],
  );

  const openAddHost = useCallback(() => {
    setPage({ name: "host-form", mode: "add" });
    setForwardFormMode(null);
  }, []);

  const openEditHost = useCallback((nextHostId: string) => {
    setPage({ name: "host-form", mode: "edit", hostId: nextHostId });
    setForwardFormMode(null);
  }, []);

  const openAddProject = useCallback(
    (
      nextHostId: string,
      options?: { initialPath?: string; migrateFromAdhoc?: boolean },
    ) => {
      setPage({
        name: "project-form",
        hostId: nextHostId,
        mode: "add",
        initialPath: options?.initialPath,
        migrateFromAdhoc: options?.migrateFromAdhoc,
      });
      setForwardFormMode(null);
    },
    [],
  );

  const openEditProject = useCallback(
    (nextHostId: string, projectId: string) => {
      setPage({
        name: "project-form",
        hostId: nextHostId,
        mode: "edit",
        projectId,
      });
      setForwardFormMode(null);
    },
    [],
  );

  const closeHostForm = useCallback(() => {
    setPage((current) => {
      if (current.name !== "host-form") return current;
      if (current.mode === "edit" && current.hostId) {
        return { name: "projects", hostId: current.hostId };
      }
      return { name: "hosts" };
    });
  }, []);

  const closeProjectForm = useCallback(() => {
    setPage((current) => {
      if (current.name !== "project-form") return current;
      if (current.migrateFromAdhoc) {
        return {
          name: "workspace",
          hostId: current.hostId,
          scope: { kind: "adhoc" },
        };
      }
      return { name: "projects", hostId: current.hostId };
    });
  }, []);

  const openAddForward = useCallback(() => {
    setForwardFormMode({ type: "add" });
  }, []);

  const openEditForward = useCallback((id: string) => {
    setForwardFormMode({ type: "edit", id });
  }, []);

  const closeForwardForm = useCallback(() => {
    setForwardFormMode(null);
  }, []);

  const afterSaveHost = useCallback((nextHostId: string) => {
    setPage({ name: "projects", hostId: nextHostId });
    setForwardFormMode(null);
  }, []);

  const afterDeleteHost = useCallback((deletedId: string) => {
    setRecents((current) =>
      current.filter((item) => item.hostId !== deletedId),
    );
    setPage({ name: "hosts" });
    setForwardFormMode(null);
  }, []);

  const afterSaveProject = useCallback(
    (nextHostId: string, projectId: string, worktreePath?: string | null) => {
      openProject(nextHostId, projectId, worktreePath);
    },
    [openProject],
  );

  const afterDeleteProject = useCallback(
    (nextHostId: string, projectId: string) => {
      const prefix = `${nextHostId}::project::${projectId}`;
      setRecents((current) =>
        current.filter((item) => {
          const id = toWorkspaceId(item);
          return id !== prefix && !id.startsWith(`${prefix}::worktree::`);
        }),
      );
      setPage({ name: "projects", hostId: nextHostId });
      setForwardFormMode(null);
    },
    [],
  );

  const afterSaveForward = useCallback(() => {
    setForwardFormMode(null);
  }, []);

  const handleBack = useCallback(() => {
    if (mobileTool) {
      setMobileTool(null);
      return true;
    }
    if (forwardFormMode) {
      setForwardFormMode(null);
      return true;
    }

    if (page.name === "host-form") {
      closeHostForm();
      return true;
    }

    if (page.name === "project-form") {
      closeProjectForm();
      return true;
    }

    if (page.name === "workspace") {
      setPage({ name: "projects", hostId: page.hostId });
      return true;
    }

    if (page.name === "projects") {
      setPage({ name: "hosts" });
      return true;
    }

    return false;
  }, [
    closeHostForm,
    closeProjectForm,
    forwardFormMode,
    mobileTool,
    page,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (page.name === "workspace") {
        if (event.key === "1") {
          onShortcutShell?.();
          return;
        }
        if (event.key === "2") {
          onShortcutFiles?.();
          return;
        }
        if (event.key === "3") {
          onShortcutPorts?.();
          return;
        }
        if (event.key === "4") {
          onShortcutGit?.();
          return;
        }
      }

      if (event.key === "Escape") {
        if (handleBack()) {
          event.preventDefault();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleBack,
    onShortcutFiles,
    onShortcutPorts,
    onShortcutShell,
    onShortcutGit,
    page.name,
  ]);

  const selectPanelTab = useCallback((tab: SidePanelTab) => {
    setPanelTabState(tab);
    setPanelCollapsedState(false);
    try {
      localStorage.setItem(PANEL_TAB_KEY, tab);
      localStorage.setItem(PANEL_COLLAPSED_KEY, "0");
    } catch {
      // ignore
    }
  }, []);

  const togglePanel = useCallback(() => {
    setPanelCollapsedState((current) => {
      try {
        localStorage.setItem(PANEL_COLLAPSED_KEY, current ? "0" : "1");
      } catch {
        // ignore
      }
      return !current;
    });
  }, []);

  const openMobileTool = useCallback((tab: SidePanelTab) => {
    setMobileTool(tab);
  }, []);

  const closeMobileTool = useCallback(() => {
    setMobileTool(null);
  }, []);

  const pruneRecents = useCallback((hostIds: Set<string>) => {
    setRecents((current) =>
      current.filter((item) => hostIds.has(item.hostId)),
    );
  }, []);

  const dropRecentWorkspace = useCallback((id: WorkspaceId) => {
    setRecents((current) =>
      current.filter((item) => toWorkspaceId(item) !== id),
    );
    const parsed = parseWorkspaceId(id);
    if (!parsed) return;
    setPage((current) => {
      if (current.name !== "workspace") return current;
      if (toWorkspaceId({ hostId: current.hostId, scope: current.scope }) !== id) {
        return current;
      }
      return { name: "projects", hostId: parsed.hostId };
    });
  }, []);

  return {
    page,
    hostId,
    workspaceId,
    forwardFormMode,
    recents,
    panelTab,
    panelCollapsed,
    selectPanelTab,
    togglePanel,
    mobileTool,
    openMobileTool,
    closeMobileTool,
    openHosts,
    openProjects,
    openWorkspace,
    openAdhoc,
    openProject,
    openRecent,
    openAddHost,
    openEditHost,
    openAddProject,
    openEditProject,
    closeHostForm,
    closeProjectForm,
    openAddForward,
    openEditForward,
    closeForwardForm,
    afterSaveHost,
    afterDeleteHost,
    afterSaveProject,
    afterDeleteProject,
    afterSaveForward,
    handleBack,
    pruneRecents,
    dropRecentWorkspace,
    rememberWorkspace,
    reorderRecents,
  };
}
