import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitAddWorktree,
  gitListWorktrees,
  gitRemoveWorktree,
} from "@/features/git/commands";
import { parseGitError } from "@/features/git/errors";
import type {
  GitCommandError,
  GitWorktreeEntry,
} from "@/features/git/types";

type UseGitWorktreesOptions = {
  hostId: string;
  connected: boolean;
  enabled?: boolean;
  cwd?: string | null;
};

export type AddWorktreeInput = {
  path: string;
  branch?: string | null;
  createBranch?: boolean;
  startPoint?: string | null;
};

function normalizeCwd(cwd: string | null | undefined): string | null {
  const value = cwd?.trim();
  if (!value) return null;
  return value;
}

export function useGitWorktrees({
  hostId,
  connected,
  enabled = true,
  cwd,
}: UseGitWorktreesOptions) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GitCommandError | null>(null);
  const [worktrees, setWorktrees] = useState<GitWorktreeEntry[]>([]);

  const hostIdRef = useRef(hostId);
  hostIdRef.current = hostId;
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const path = normalizeCwd(cwdRef.current);
    if (!enabledRef.current || !connectedRef.current || !path) {
      if (requestId === requestIdRef.current) {
        setWorktrees([]);
        setLoading(false);
        setError(null);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await gitListWorktrees(hostIdRef.current, path);
      if (requestId !== requestIdRef.current) return;
      setWorktrees(result.worktrees);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setWorktrees([]);
      setError(parseGitError(err));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, hostId, connected, enabled, cwd]);

  const add = useCallback(
    async (input: AddWorktreeInput) => {
      const path = normalizeCwd(cwdRef.current);
      if (!path || !connectedRef.current) {
        throw parseGitError(new Error("not connected"));
      }
      setBusy(true);
      setError(null);
      try {
        const entry = await gitAddWorktree(hostIdRef.current, path, input.path, {
          branch: input.branch,
          createBranch: input.createBranch,
          startPoint: input.startPoint,
        });
        await refresh();
        return entry;
      } catch (err) {
        const parsed = parseGitError(err);
        setError(parsed);
        throw parsed;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (worktreePath: string, force = false) => {
      const path = normalizeCwd(cwdRef.current);
      if (!path || !connectedRef.current) {
        throw parseGitError(new Error("not connected"));
      }
      setBusy(true);
      setError(null);
      try {
        await gitRemoveWorktree(
          hostIdRef.current,
          path,
          worktreePath,
          force,
        );
        await refresh();
      } catch (err) {
        const parsed = parseGitError(err);
        setError(parsed);
        throw parsed;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return {
    worktrees,
    loading,
    busy,
    error,
    path: normalizeCwd(cwd),
    refresh,
    add,
    remove,
  };
}

export type GitWorktreesController = ReturnType<typeof useGitWorktrees>;
