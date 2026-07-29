import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppPage, ForwardFormMode } from "@/app/types";
import {
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
};

function pageWorkspaceId(page: AppPage): WorkspaceId | null {
  if (page.name !== "workspace") return null;
  return toWorkspaceId({ hostId: page.hostId, scope: page.scope });
}

export function useWorkspace({
  onShortcutFiles,
  onShortcutPorts,
  onShortcutShell,
}: UseWorkspaceOptions) {
  const [page, setPage] = useState<AppPage>({ name: "hosts" });
  const [forwardFormMode, setForwardFormMode] = useState<ForwardFormMode>(null);
  const [recents, setRecents] = useState<WorkspaceRef[]>([]);

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
  }, []);

  const openProjects = useCallback((nextHostId: string) => {
    setPage({ name: "projects", hostId: nextHostId });
    setForwardFormMode(null);
  }, []);

  const openWorkspace = useCallback(
    (nextHostId: string, scope: WorkspaceScope) => {
      const nextScope: WorkspaceScope =
        scope.kind === "project"
          ? { kind: "project", projectId: scope.projectId }
          : { kind: "adhoc" };
      const ref = { hostId: nextHostId, scope: nextScope };
      rememberWorkspace(ref);
      setPage({
        name: "workspace",
        hostId: nextHostId,
        scope: nextScope,
      });
      setForwardFormMode(null);
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
    (nextHostId: string, projectId: string) => {
      openWorkspace(nextHostId, { kind: "project", projectId });
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
    (nextHostId: string, projectId: string) => {
      openProject(nextHostId, projectId);
    },
    [openProject],
  );

  const afterDeleteProject = useCallback(
    (nextHostId: string, projectId: string) => {
      const workspaceId = toWorkspaceId({
        hostId: nextHostId,
        scope: { kind: "project", projectId },
      });
      setRecents((current) =>
        current.filter((item) => toWorkspaceId(item) !== workspaceId),
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
  }, [closeHostForm, closeProjectForm, forwardFormMode, page]);

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
    page.name,
  ]);

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
