import { useCallback, useEffect, useState } from "react";
import type {
  FormMode,
  ForwardFormMode,
  MobilePane,
  WorkspaceTab,
} from "@/app/types";
import type { Host } from "@/features/hosts/types";

type UseWorkspaceOptions = {
  hosts: Host[];
};

export function useWorkspace({ hosts }: UseWorkspaceOptions) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("terminal");
  const [mobilePane, setMobilePane] = useState<MobilePane>("hosts");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [forwardFormMode, setForwardFormMode] = useState<ForwardFormMode>(null);

  const selectHost = useCallback((id: string) => {
    setSelectedId(id);
    setFormMode(null);
    setForwardFormMode(null);
    setMobilePane("session");
  }, []);

  const backToHosts = useCallback(() => {
    setMobilePane("hosts");
    setFormMode(null);
    setForwardFormMode(null);
  }, []);

  const openAddHost = useCallback(() => {
    setFormMode({ type: "add" });
    setForwardFormMode(null);
    setMobilePane("session");
  }, []);

  const openEditHost = useCallback((id: string) => {
    setFormMode({ type: "edit", id });
    setForwardFormMode(null);
  }, []);

  const closeHostForm = useCallback(() => {
    setFormMode(null);
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

  const afterSaveHost = useCallback((hostId: string) => {
    setSelectedId(hostId);
    setFormMode(null);
    setForwardFormMode(null);
    setTab("terminal");
    setMobilePane("session");
  }, []);

  const afterDeleteHost = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : current));
    setFormMode(null);
    setForwardFormMode(null);
    setMobilePane("hosts");
  }, []);

  const afterSaveForward = useCallback(() => {
    setForwardFormMode(null);
    setTab("forwards");
  }, []);

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

      if (event.key === "1") {
        setTab("terminal");
        return;
      }
      if (event.key === "2") {
        setTab("sftp");
        return;
      }
      if (event.key === "3") {
        setTab("forwards");
        return;
      }

      if (event.key === "Escape" && mobilePane === "session") {
        if (forwardFormMode) {
          setForwardFormMode(null);
          return;
        }
        setMobilePane("hosts");
        setFormMode(null);
        return;
      }

      if (event.key !== "j" && event.key !== "k") return;
      if (hosts.length === 0) return;

      const currentIndex = Math.max(
        0,
        hosts.findIndex((host) => host.id === selectedId),
      );
      const delta = event.key === "j" ? 1 : -1;
      const nextIndex = Math.min(
        hosts.length - 1,
        Math.max(0, currentIndex + delta),
      );
      setSelectedId(hosts[nextIndex].id);
      setFormMode(null);
      setForwardFormMode(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hosts, selectedId, mobilePane, forwardFormMode]);

  return {
    selectedId,
    setSelectedId,
    tab,
    setTab,
    mobilePane,
    formMode,
    forwardFormMode,
    selectHost,
    backToHosts,
    openAddHost,
    openEditHost,
    closeHostForm,
    openAddForward,
    openEditForward,
    closeForwardForm,
    afterSaveHost,
    afterDeleteHost,
    afterSaveForward,
  };
}
