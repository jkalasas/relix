import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitCommit,
  gitDiff,
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
  GitChangedFile,
  GitCommandError,
  GitDiffResult,
  GitPanelSnapshot,
} from "@/features/git/types";

type UseGitOptions = {
  hostId: string;
  connected: boolean;
  enabled?: boolean;
  cwd?: string | null;
};

export type GitDiffSelection = {
  /** Repo-relative path, or `null` for the full staged/working-tree patch. */
  path: string | null;
  originalPath: string | null;
  staged: boolean;
  untracked: boolean;
  statusLabel: string;
};

function normalizeCwd(cwd: string | null | undefined): string | null {
  const value = cwd?.trim();
  if (!value) return null;
  return value;
}

function selectionFromFile(
  file: GitChangedFile,
  mode: "staged" | "changes",
): GitDiffSelection {
  return {
    path: file.path,
    originalPath: file.originalPath,
    staged: mode === "staged",
    untracked: file.untracked && mode === "changes",
    statusLabel: file.statusLabel,
  };
}

function emptyDiffResult(): GitDiffResult {
  return { diffText: "", truncated: false };
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
  const [selectedDiff, setSelectedDiff] = useState<GitDiffSelection | null>(
    null,
  );
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<GitCommandError | null>(null);
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null);

  const hostIdRef = useRef(hostId);
  hostIdRef.current = hostId;
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const requestIdRef = useRef(0);
  const diffRequestIdRef = useRef(0);
  const selectedDiffRef = useRef(selectedDiff);
  selectedDiffRef.current = selectedDiff;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const clearDiff = useCallback(() => {
    diffRequestIdRef.current += 1;
    setSelectedDiff(null);
    setDiffLoading(false);
    setDiffError(null);
    setDiffResult(null);
  }, []);

  const loadDiff = useCallback(
    async (selection: GitDiffSelection, repoRoot: string) => {
      const requestId = ++diffRequestIdRef.current;

      if (selection.untracked && !selection.staged) {
        setDiffLoading(false);
        setDiffError(null);
        setDiffResult(emptyDiffResult());
        return;
      }

      setDiffLoading(true);
      setDiffError(null);

      try {
        const next = await gitDiff(
          hostIdRef.current,
          repoRoot,
          selection.path,
          selection.staged,
        );
        if (requestId !== diffRequestIdRef.current) return;
        setDiffResult(next);
        setDiffError(null);
      } catch (err) {
        if (requestId !== diffRequestIdRef.current) return;
        setDiffResult(null);
        setDiffError(parseGitError(err));
      } finally {
        if (requestId === diffRequestIdRef.current) {
          setDiffLoading(false);
        }
      }
    },
    [],
  );

  const loadSnapshot = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const currentHostId = hostIdRef.current;
      const path = normalizeCwd(cwdRef.current);
      if (!path) {
        setSnapshot(null);
        setError(null);
        setLoading(false);
        clearDiff();
        return;
      }

      const requestId = ++requestIdRef.current;
      if (!opts?.quiet) setLoading(true);

      try {
        const next = await gitPanelSnapshot(currentHostId, path);
        if (requestId !== requestIdRef.current) return;
        setSnapshot(next);
        setError(null);

        const selection = selectedDiffRef.current;
        const repoRoot =
          next.status?.repoRoot ?? next.repo?.repoRoot ?? null;
        if (selection && repoRoot) {
          void loadDiff(selection, repoRoot);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setSnapshot(null);
        setError(parseGitError(err));
        clearDiff();
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [clearDiff, loadDiff],
  );

  useEffect(() => {
    if (!enabled || !connected) {
      requestIdRef.current += 1;
      setSnapshot(null);
      setError(null);
      setLoading(false);
      setBusy(false);
      clearDiff();
      return;
    }
    void loadSnapshot();
  }, [clearDiff, connected, cwd, enabled, hostId, loadSnapshot]);

  const refresh = useCallback(async () => {
    if (!enabled || !connected) return;
    await loadSnapshot({ quiet: true });
  }, [connected, enabled, loadSnapshot]);

  const openDiff = useCallback(
    (file: GitChangedFile, mode: "staged" | "changes") => {
      const repoRoot =
        snapshotRef.current?.status?.repoRoot ??
        snapshotRef.current?.repo?.repoRoot ??
        null;
      if (!repoRoot || !connected) return;

      const selection = selectionFromFile(file, mode);
      setSelectedDiff(selection);
      void loadDiff(selection, repoRoot);
    },
    [connected, loadDiff],
  );

  const openDiffAll = useCallback(
    (mode: "staged" | "changes") => {
      const repoRoot =
        snapshotRef.current?.status?.repoRoot ??
        snapshotRef.current?.repo?.repoRoot ??
        null;
      if (!repoRoot || !connected) return;

      const selection: GitDiffSelection = {
        path: null,
        originalPath: null,
        staged: mode === "staged",
        untracked: false,
        statusLabel: mode === "staged" ? "All staged" : "All changes",
      };
      setSelectedDiff(selection);
      void loadDiff(selection, repoRoot);
    },
    [connected, loadDiff],
  );

  const closeDiff = useCallback(() => {
    clearDiff();
  }, [clearDiff]);

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
    selectedDiff,
    diffLoading,
    diffError,
    diffResult,
    openDiff,
    openDiffAll,
    closeDiff,
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
