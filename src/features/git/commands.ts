import { invoke } from "@tauri-apps/api/core";
import type {
  DiscardEntry,
  GitBranchListResult,
  GitCommitFileChange,
  GitCommitResult,
  GitDiffContentResult,
  GitDiffResult,
  GitLogEntry,
  GitPanelSnapshot,
  GitPushResult,
  GitRepoInfo,
  GitStatusSnapshot,
} from "@/features/git/types";

export function gitResolveRepo(hostId: string, cwd: string) {
  return invoke<GitRepoInfo | null>("git_resolve_repo", { hostId, cwd });
}

export function gitPanelSnapshot(hostId: string, cwd: string) {
  return invoke<GitPanelSnapshot>("git_panel_snapshot", { hostId, cwd });
}

export function gitStatus(hostId: string, repoRoot: string) {
  return invoke<GitStatusSnapshot>("git_status", { hostId, repoRoot });
}

export function gitDiff(
  hostId: string,
  repoRoot: string,
  path: string | null,
  staged: boolean,
) {
  return invoke<GitDiffResult>("git_diff", { hostId, repoRoot, path, staged });
}

export function gitDiffContent(
  hostId: string,
  repoRoot: string,
  path: string,
  staged: boolean,
  originalPath: string | null,
) {
  return invoke<GitDiffContentResult>("git_diff_content", {
    hostId,
    repoRoot,
    path,
    staged,
    originalPath,
  });
}

export function gitStage(hostId: string, repoRoot: string, paths: string[]) {
  return invoke<void>("git_stage", { hostId, repoRoot, paths });
}

export function gitUnstage(hostId: string, repoRoot: string, paths: string[]) {
  return invoke<void>("git_unstage", { hostId, repoRoot, paths });
}

export function gitDiscard(
  hostId: string,
  repoRoot: string,
  entries: DiscardEntry[],
) {
  return invoke<void>("git_discard", { hostId, repoRoot, entries });
}

export function gitCommit(hostId: string, repoRoot: string, message: string) {
  return invoke<GitCommitResult>("git_commit", { hostId, repoRoot, message });
}

export function gitFetch(hostId: string, repoRoot: string) {
  return invoke<void>("git_fetch", { hostId, repoRoot });
}

export function gitPullFfOnly(hostId: string, repoRoot: string) {
  return invoke<void>("git_pull_ff_only", { hostId, repoRoot });
}

export function gitPush(hostId: string, repoRoot: string) {
  return invoke<GitPushResult>("git_push", { hostId, repoRoot });
}

export function gitLog(
  hostId: string,
  repoRoot: string,
  limit?: number | null,
  beforeSha?: string | null,
) {
  return invoke<GitLogEntry[]>("git_log", {
    hostId,
    repoRoot,
    limit: limit ?? null,
    beforeSha: beforeSha ?? null,
  });
}

export function gitShowCommit(hostId: string, repoRoot: string, sha: string) {
  return invoke<GitDiffResult>("git_show_commit", { hostId, repoRoot, sha });
}

export function gitCommitFiles(hostId: string, repoRoot: string, sha: string) {
  return invoke<GitCommitFileChange[]>("git_commit_files", {
    hostId,
    repoRoot,
    sha,
  });
}

export function gitCommitFileDiff(
  hostId: string,
  repoRoot: string,
  sha: string,
  path: string,
  originalPath: string | null,
) {
  return invoke<GitDiffContentResult>("git_commit_file_diff", {
    hostId,
    repoRoot,
    sha,
    path,
    originalPath,
  });
}

export function gitListBranches(hostId: string, repoRoot: string) {
  return invoke<GitBranchListResult>("git_list_branches", {
    hostId,
    repoRoot,
  });
}

export function gitCheckoutBranch(
  hostId: string,
  repoRoot: string,
  branch: string,
) {
  return invoke<void>("git_checkout_branch", { hostId, repoRoot, branch });
}

export function gitCreateBranch(
  hostId: string,
  repoRoot: string,
  name: string,
  checkout: boolean,
) {
  return invoke<void>("git_create_branch", {
    hostId,
    repoRoot,
    name,
    checkout,
  });
}

export function gitRemoteUrl(
  hostId: string,
  repoRoot: string,
  name?: string | null,
) {
  return invoke<string | null>("git_remote_url", {
    hostId,
    repoRoot,
    name: name ?? null,
  });
}
