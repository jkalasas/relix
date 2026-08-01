import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitCommit,
  gitDiscard,
  gitFetch,
  gitPanelSnapshot,
  gitPullFfOnly,
  gitPush,
  gitStage,
  gitUnstage,
} from "@/features/git/commands";
import { parseGitError } from "@/features/git/errors";
import type {
  DiscardEntry,
  GitCommandError,
  GitPanelSnapshot,
} from "@/features/git/types";

type UseGitOptions = {
  hostId: string;
  connected: boolean;
  enabled?: boolean;
  cwd?: string | null;
};

function normalizeCwd(cwd: string | null | undefined): string | null {
  const value = cwd?.trim();
  if (!value) return null;
  return value;
}

export function useGit({
  hostId,
  connected,
  enabled = true,
  cwd,
}: UseGitOptions) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GitCommandError | null>(null);
  const [snapshot, setSnapshot] = useState<GitPanelSnapshot | null>(null);
  const [commitMessage, setCommitMessage] = useState("");

  const hostIdRef = useRef(hostId);
  hostIdRef.current = hostId;
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const requestIdRef = useRef(0);

  const loadSnapshot = useCallback(async (opts?: { quiet?: boolean }) => {
    const currentHostId = hostIdRef.current;
    const path = normalizeCwd(cwdRef.current);
    if (!path) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (!opts?.quiet) setLoading(true);

    try {
      const next = await gitPanelSnapshot(currentHostId, path);
      if (requestId !== requestIdRef.current) return;
      setSnapshot(next);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setSnapshot(null);
      setError(parseGitError(err));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !connected) {
      requestIdRef.current += 1;
      setSnapshot(null);
      setError(null);
      setLoading(false);
      setBusy(false);
      return;
    }
    void loadSnapshot();
  }, [connected, cwd, enabled, hostId, loadSnapshot]);

  const refresh = useCallback(async () => {
    if (!enabled || !connected) return;
    await loadSnapshot({ quiet: true });
  }, [connected, enabled, loadSnapshot]);

  const runMutation = useCallback(
    async (action: (repoRoot: string) => Promise<void>) => {
      const repoRoot =
        snapshot?.status?.repoRoot ?? snapshot?.repo?.repoRoot ?? null;
      if (!repoRoot || busy || !connected) return;
      setBusy(true);
      setError(null);
      try {
        await action(repoRoot);
        await loadSnapshot({ quiet: true });
      } catch (err) {
        setError(parseGitError(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, connected, loadSnapshot, snapshot],
  );

  const stage = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      void runMutation((repoRoot) =>
        gitStage(hostIdRef.current, repoRoot, paths),
      );
    },
    [runMutation],
  );

  const unstage = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      void runMutation((repoRoot) =>
        gitUnstage(hostIdRef.current, repoRoot, paths),
      );
    },
    [runMutation],
  );

  const discard = useCallback(
    (entries: DiscardEntry[]) => {
      if (entries.length === 0) return;
      void runMutation((repoRoot) =>
        gitDiscard(hostIdRef.current, repoRoot, entries),
      );
    },
    [runMutation],
  );

  const commit = useCallback(async () => {
    const message = commitMessage.trim();
    if (!message) {
      setError({
        code: "empty_commit_message",
        message: "Commit message is empty",
      });
      return;
    }
    const repoRoot =
      snapshot?.status?.repoRoot ?? snapshot?.repo?.repoRoot ?? null;
    if (!repoRoot || busy || !connected) return;

    setBusy(true);
    setError(null);
    try {
      await gitCommit(hostIdRef.current, repoRoot, message);
      setCommitMessage("");
      await loadSnapshot({ quiet: true });
    } catch (err) {
      setError(parseGitError(err));
    } finally {
      setBusy(false);
    }
  }, [busy, commitMessage, connected, loadSnapshot, snapshot]);

  const fetch = useCallback(() => {
    void runMutation((repoRoot) => gitFetch(hostIdRef.current, repoRoot));
  }, [runMutation]);

  const pull = useCallback(() => {
    void runMutation((repoRoot) =>
      gitPullFfOnly(hostIdRef.current, repoRoot),
    );
  }, [runMutation]);

  const push = useCallback(() => {
    void runMutation(async (repoRoot) => {
      await gitPush(hostIdRef.current, repoRoot);
    });
  }, [runMutation]);

  const path = normalizeCwd(cwd);

  return {
    loading,
    busy,
    error,
    snapshot,
    commitMessage,
    setCommitMessage,
    path,
    refresh,
    stage,
    unstage,
    discard,
    commit,
    fetch,
    pull,
    push,
  };
}

export type GitController = ReturnType<typeof useGit>;
