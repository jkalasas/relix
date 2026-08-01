use std::collections::HashMap;
use std::path::Path;

use crate::git::error::{GitError, GitErrorCode, Result};
use crate::git::parser::{parse_porcelain_v2, parse_shortstat};
use crate::git::path::{
    literal_pathspec, sha_is_safe, validate_branch_name, validate_local_dir,
    validate_repo_rel_path, validate_worktree_path,
};
use crate::git::runner::{
    ensure_git_available, ensure_success, git_stdout_line_opt, git_stdout_lines, GitBackend,
};
use crate::git::types::{
    DiscardEntry, GitBranchEntry, GitBranchListResult, GitCommitFileChange, GitCommitResult,
    GitDiffContentResult, GitDiffResult, GitLogEntry, GitOutput, GitPanelSnapshot, GitPushResult,
    GitRepoInfo, GitStatusSnapshot, GitWorktreeEntry, GitWorktreeListResult, TextSource,
    DEFAULT_TIMEOUT_SECS, MAX_FILE_BYTES, MAX_LOG_LIMIT, NETWORK_TIMEOUT_SECS,
};

const LOG_FORMAT: &str = "%H%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%s";

fn prepare_cwd(backend: &GitBackend, cwd: &str) -> Result<String> {
    match backend {
        GitBackend::Local => validate_local_dir(cwd),
        GitBackend::Remote(_) => {
            let trimmed = cwd.trim();
            if trimmed.is_empty() {
                return Err(GitError::new(GitErrorCode::NotADirectory, "path is empty"));
            }
            Ok(trimmed.replace('\\', "/"))
        }
    }
}

fn is_local(backend: &GitBackend) -> bool {
    matches!(backend, GitBackend::Local)
}

fn decode_text(bytes: Vec<u8>) -> TextSource {
    let sniff_len = bytes.len().min(8192);
    if bytes[..sniff_len].contains(&0) {
        return TextSource::Binary;
    }
    match String::from_utf8(bytes) {
        Ok(text) => TextSource::Text(text),
        Err(e) => TextSource::Text(String::from_utf8_lossy(&e.into_bytes()).into_owned()),
    }
}

fn read_local_text_file(repo_root: &str, rel: &str) -> Result<TextSource> {
    let path = Path::new(repo_root).join(rel);
    let meta = match std::fs::symlink_metadata(&path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(TextSource::Missing),
        Err(e) => {
            return Err(GitError::new(
                GitErrorCode::Internal,
                format!("read {}: {e}", path.display()),
            ))
        }
    };
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Ok(TextSource::Missing);
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(GitError::new(
            GitErrorCode::FileTooLarge,
            format!(
                "{} is {} bytes (max {MAX_FILE_BYTES})",
                path.display(),
                meta.len()
            ),
        ));
    }
    let bytes = std::fs::read(&path).map_err(|e| {
        GitError::new(
            GitErrorCode::Internal,
            format!("read {}: {e}", path.display()),
        )
    })?;
    Ok(decode_text(bytes))
}

async fn git_show_text(backend: &GitBackend, repo_root: &str, spec: &str) -> Result<TextSource> {
    let output = backend
        .run(
            repo_root,
            &["show", "--no-textconv", spec],
            DEFAULT_TIMEOUT_SECS,
        )
        .await?;
    if output.timed_out {
        return Err(GitError::new(
            GitErrorCode::TimedOut,
            "git show timed out",
        ));
    }
    if output.exit_code != Some(0) {
        return Ok(TextSource::Missing);
    }
    Ok(decode_text(output.stdout))
}

fn looks_like_no_head(output: &GitOutput) -> bool {
    let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    stderr.contains("ambiguous argument 'head'")
        || stderr.contains("unknown revision")
        || stderr.contains("does not have any commits yet")
        || stderr.contains("bad revision 'head'")
}

fn nothing_to_commit(output: &GitOutput) -> bool {
    let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    let stdout = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
    stderr.contains("nothing to commit") || stdout.contains("nothing to commit")
}

fn split_upstream(upstream: &str) -> (Option<String>, Option<String>) {
    match upstream.split_once('/') {
        Some((remote, branch)) => (Some(remote.to_string()), Some(branch.to_string())),
        None => (None, Some(upstream.to_string())),
    }
}

fn is_remote_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.'
}

fn status_label_for(c: char) -> String {
    match c {
        'A' => "Added".into(),
        'M' => "Modified".into(),
        'D' => "Deleted".into(),
        'R' => "Renamed".into(),
        'C' => "Copied".into(),
        'T' => "Type changed".into(),
        'U' => "Unmerged".into(),
        _ => format!("Status {c}"),
    }
}

fn map_network_error(output: &GitOutput, context: &'static str) -> GitError {
    if output.timed_out {
        return GitError::new(GitErrorCode::TimedOut, format!("{context} timed out"));
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("authentication failed")
        || lower.contains("permission denied (publickey)")
        || lower.contains("invalid credentials")
    {
        return GitError::new(
            GitErrorCode::AuthRequired,
            stderr.lines().next().unwrap_or(stderr.as_ref()).to_string(),
        );
    }
    if lower.contains("no upstream")
        || lower.contains("does not have an upstream")
        || lower.contains("no tracking information")
        || lower.contains("you asked to pull from the remote")
    {
        return GitError::new(
            GitErrorCode::NoUpstream,
            stderr.lines().next().unwrap_or("no upstream configured").to_string(),
        );
    }
    let detail = {
        let trimmed = stderr.trim();
        if !trimmed.is_empty() {
            trimmed.to_string()
        } else {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let t = stdout.trim();
            if t.is_empty() {
                "unknown git error".into()
            } else {
                t.to_string()
            }
        }
    };
    GitError::command(context, detail)
}

fn ensure_network_success(output: &GitOutput, context: &'static str) -> Result<()> {
    if output.exit_code == Some(0) && !output.timed_out {
        return Ok(());
    }
    Err(map_network_error(output, context))
}

fn stdout_to_string(bytes: Vec<u8>) -> String {
    match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(e) => String::from_utf8_lossy(&e.into_bytes()).into_owned(),
    }
}

fn validate_paths(paths: &[String]) -> Result<Vec<String>> {
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        let rel = validate_repo_rel_path(p)?;
        out.push(literal_pathspec(&rel));
    }
    Ok(out)
}

pub async fn resolve_repo(
    backend: &GitBackend,
    host_id: &str,
    cwd: &str,
) -> Result<Option<GitRepoInfo>> {
    let cwd = prepare_cwd(backend, cwd)?;
    ensure_git_available(backend, host_id).await?;

    let Some(root_line) =
        git_stdout_line_opt(backend, &cwd, &["rev-parse", "--show-toplevel"]).await?
    else {
        return Ok(None);
    };
    let repo_root = prepare_cwd(backend, &root_line)?;

    let head = match git_stdout_lines(backend, &repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .await?
        .into_iter()
        .next()
    {
        Some(h) if !h.is_empty() => h,
        _ => git_stdout_line_opt(backend, &repo_root, &["symbolic-ref", "--short", "HEAD"])
            .await?
            .ok_or_else(|| GitError::command("failed to resolve HEAD", ""))?,
    };

    let upstream = git_stdout_line_opt(
        backend,
        &repo_root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .await?;

    Ok(Some(GitRepoInfo {
        repo_root,
        branch: head.clone(),
        upstream,
        is_detached: head == "HEAD",
    }))
}

pub async fn status(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
) -> Result<GitStatusSnapshot> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    status_inner(backend, &repo_root).await
}

async fn status_inner(backend: &GitBackend, repo_root: &str) -> Result<GitStatusSnapshot> {
    let output = backend
        .run(
            repo_root,
            &[
                "status",
                "--porcelain=v2",
                "--branch",
                "-z",
                "--untracked-files=all",
            ],
            DEFAULT_TIMEOUT_SECS,
        )
        .await?;
    ensure_success(&output, "git status failed")?;

    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    let parsed = parse_porcelain_v2(stdout);

    Ok(GitStatusSnapshot {
        repo_root: repo_root.to_string(),
        branch: parsed.branch,
        upstream: parsed.upstream,
        ahead: parsed.ahead,
        behind: parsed.behind,
        is_detached: parsed.is_detached,
        truncated: output.truncated,
        changed_files: parsed.files,
    })
}

pub async fn panel_snapshot(
    backend: &GitBackend,
    host_id: &str,
    cwd: &str,
) -> Result<GitPanelSnapshot> {
    let cwd = prepare_cwd(backend, cwd)?;
    ensure_git_available(backend, host_id).await?;

    let Some(root_line) =
        git_stdout_line_opt(backend, &cwd, &["rev-parse", "--show-toplevel"]).await?
    else {
        return Ok(GitPanelSnapshot {
            repo: None,
            status: None,
        });
    };
    let repo_root = prepare_cwd(backend, &root_line)?;
    let status = status_inner(backend, &repo_root).await?;
    let repo = GitRepoInfo {
        repo_root: repo_root.clone(),
        branch: status.branch.clone(),
        upstream: status.upstream.clone(),
        is_detached: status.is_detached,
    };
    Ok(GitPanelSnapshot {
        repo: Some(repo),
        status: Some(status),
    })
}

pub async fn stage(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    paths: &[String],
) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    if paths.is_empty() {
        return Ok(());
    }
    let resolved = validate_paths(paths)?;
    let mut args: Vec<String> = vec!["add".into(), "--".into()];
    args.extend(resolved);
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = backend
        .run(&repo_root, &arg_refs, DEFAULT_TIMEOUT_SECS)
        .await?;
    ensure_success(&output, "git add failed")
}

pub async fn unstage(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    paths: &[String],
) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    if paths.is_empty() {
        return Ok(());
    }
    let resolved = validate_paths(paths)?;

    let mut reset_args: Vec<String> = vec!["reset".into(), "HEAD".into(), "--".into()];
    reset_args.extend(resolved.iter().cloned());
    let reset_refs: Vec<&str> = reset_args.iter().map(|s| s.as_str()).collect();
    let output = backend
        .run(&repo_root, &reset_refs, DEFAULT_TIMEOUT_SECS)
        .await?;
    if output.exit_code == Some(0) {
        return Ok(());
    }
    if !looks_like_no_head(&output) {
        return ensure_success(&output, "git reset failed");
    }

    let mut rm_args: Vec<String> = vec![
        "rm".into(),
        "--cached".into(),
        "-r".into(),
        "--ignore-unmatch".into(),
        "--".into(),
    ];
    rm_args.extend(resolved);
    let rm_refs: Vec<&str> = rm_args.iter().map(|s| s.as_str()).collect();
    let output = backend
        .run(&repo_root, &rm_refs, DEFAULT_TIMEOUT_SECS)
        .await?;
    ensure_success(&output, "git rm --cached failed")
}

pub async fn discard(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    entries: &[DiscardEntry],
) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    if entries.is_empty() {
        return Ok(());
    }

    let mut tracked: Vec<String> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();
    for entry in entries {
        let path = validate_repo_rel_path(&entry.path)?;
        let pathspec = literal_pathspec(&path);
        if entry.untracked {
            untracked.push(pathspec);
        } else {
            tracked.push(pathspec);
        }
    }

    if !tracked.is_empty() {
        let mut args: Vec<String> = vec!["restore".into(), "--worktree".into(), "--".into()];
        args.extend(tracked);
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let output = backend
            .run(&repo_root, &arg_refs, DEFAULT_TIMEOUT_SECS)
            .await?;
        ensure_success(&output, "git restore failed")?;
    }

    if !untracked.is_empty() {
        let mut args: Vec<String> =
            vec!["clean".into(), "-f".into(), "-d".into(), "--".into()];
        args.extend(untracked);
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let output = backend
            .run(&repo_root, &arg_refs, DEFAULT_TIMEOUT_SECS)
            .await?;
        ensure_success(&output, "git clean failed")?;
    }

    Ok(())
}

pub async fn commit(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    message: &str,
) -> Result<GitCommitResult> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(GitError::new(
            GitErrorCode::EmptyCommitMessage,
            "commit message is empty",
        ));
    }

    let output = backend
        .run(
            &repo_root,
            &["commit", "-m", trimmed],
            DEFAULT_TIMEOUT_SECS,
        )
        .await?;
    if output.exit_code != Some(0) && nothing_to_commit(&output) {
        return Err(GitError::command("git commit", "nothing staged"));
    }
    ensure_success(&output, "git commit failed")?;

    let combined =
        git_stdout_lines(backend, &repo_root, &["show", "-s", "--format=%H%n%s", "HEAD"]).await?;
    let sha = combined
        .first()
        .cloned()
        .ok_or_else(|| GitError::command("failed to resolve commit sha", ""))?;
    let summary = combined.get(1).cloned().unwrap_or_default();

    Ok(GitCommitResult {
        commit_sha: sha,
        summary,
    })
}

pub async fn log(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    limit: u32,
    before_sha: Option<&str>,
) -> Result<Vec<GitLogEntry>> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let bounded = limit.clamp(1, MAX_LOG_LIMIT);
    let count_arg = format!("--max-count={bounded}");
    let format_arg = format!("--format={LOG_FORMAT}");
    let cursor = match before_sha {
        Some(sha) if !sha.is_empty() => {
            if !sha_is_safe(sha) {
                return Err(GitError::command("git log", "invalid cursor sha"));
            }
            Some(format!("{sha}^"))
        }
        _ => None,
    };

    let mut args: Vec<&str> = vec![
        "log",
        "--no-color",
        "--shortstat",
        &count_arg,
        &format_arg,
    ];
    if let Some(spec) = cursor.as_deref() {
        args.push(spec);
    }

    let output = backend
        .run(&repo_root, &args, DEFAULT_TIMEOUT_SECS)
        .await?;
    if output.timed_out {
        return Err(GitError::new(
            GitErrorCode::TimedOut,
            "git log timed out",
        ));
    }
    if output.exit_code != Some(0) {
        let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        if stderr.contains("does not have any commits yet")
            || stderr.contains("bad default revision")
            || stderr.contains("unknown revision")
            || stderr.contains("ambiguous argument 'head'")
        {
            return Ok(Vec::new());
        }
        ensure_success(&output, "git log failed")?;
        return Ok(Vec::new());
    }

    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    let mut entries: Vec<GitLogEntry> = Vec::with_capacity(bounded as usize);
    for raw_line in stdout.lines() {
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        if line.contains('\x1f') {
            let mut fields = line.splitn(6, '\x1f');
            let sha = fields.next().unwrap_or("").to_string();
            if !sha_is_safe(&sha) {
                continue;
            }
            let author = fields.next().unwrap_or("").to_string();
            let author_email = fields.next().unwrap_or("").to_string();
            let timestamp = fields.next().unwrap_or("0").parse::<i64>().unwrap_or(0);
            let parents_raw = fields.next().unwrap_or("");
            let parents: Vec<String> = parents_raw
                .split_ascii_whitespace()
                .map(|s| s.to_string())
                .collect();
            let subject = fields.next().unwrap_or("").to_string();
            let short_sha = sha.chars().take(7).collect::<String>();
            entries.push(GitLogEntry {
                sha,
                short_sha,
                author,
                author_email,
                timestamp_secs: timestamp,
                parents,
                subject,
                files_changed: 0,
                insertions: 0,
                deletions: 0,
            });
            continue;
        }
        if let Some(current) = entries.last_mut() {
            if line.contains("file changed") || line.contains("files changed") {
                let (files, ins, del) = parse_shortstat(line);
                current.files_changed = files;
                current.insertions = ins;
                current.deletions = del;
            }
        }
    }
    Ok(entries)
}

pub async fn list_branches(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
) -> Result<GitBranchListResult> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;

    let mut branches: Vec<GitBranchEntry> = Vec::new();

    let current_branch =
        git_stdout_line_opt(backend, &repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])
            .await
            .ok()
            .flatten();
    let is_detached_head = current_branch.as_deref() == Some("HEAD");

    if let Ok(lines) = git_stdout_lines(
        backend,
        &repo_root,
        &["branch", "--format=%(refname:short)%00%(HEAD)"],
    )
    .await
    {
        for line in &lines {
            let mut parts = line.split('\0');
            let name = parts.next().unwrap_or("").to_string();
            let head_marker = parts.next().unwrap_or("");
            let is_head = head_marker == "*";
            if !name.is_empty() {
                branches.push(GitBranchEntry {
                    name,
                    kind: "local".into(),
                    worktree_path: None,
                    is_head,
                    is_detached: is_head && is_detached_head,
                });
            }
        }
    }

    if let Ok(lines) =
        git_stdout_lines(backend, &repo_root, &["worktree", "list", "--porcelain"]).await
    {
        let mut current_worktree: Option<String> = None;
        let mut worktree_branch: Option<String> = None;
        let mut worktree_bare = false;
        let mut head_sha: Option<String> = None;
        for line in &lines {
            if let Some(rest) = line.strip_prefix("worktree ") {
                if let Some(wt_path) = current_worktree.take() {
                    if !worktree_bare {
                        push_worktree(
                            &mut branches,
                            wt_path,
                            worktree_branch.take(),
                            head_sha.take(),
                        );
                    }
                }
                current_worktree = Some(rest.trim().to_string());
                worktree_branch = None;
                worktree_bare = false;
                head_sha = None;
            } else if let Some(rest) = line.strip_prefix("HEAD ") {
                head_sha = Some(rest.trim().to_string());
            } else if let Some(rest) = line.strip_prefix("branch ") {
                let raw = rest.trim();
                worktree_branch =
                    Some(raw.strip_prefix("refs/heads/").unwrap_or(raw).to_string());
            } else if line.starts_with("bare") {
                worktree_bare = true;
            }
        }
        if let Some(wt_path) = current_worktree.take() {
            if !worktree_bare {
                push_worktree(
                    &mut branches,
                    wt_path,
                    worktree_branch.take(),
                    head_sha.take(),
                );
            }
        }
    }

    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut deduped: Vec<GitBranchEntry> = Vec::with_capacity(branches.len());
    for b in branches {
        if let Some(&existing_idx) = seen.get(&b.name) {
            let existing = &deduped[existing_idx];
            let should_replace = b.kind == "worktree"
                && existing.kind == "local"
                && existing.worktree_path.is_none()
                && !existing.is_head;
            if should_replace {
                let is_head = existing.is_head || b.is_head;
                deduped[existing_idx] = GitBranchEntry { is_head, ..b };
            } else if b.is_head && !existing.is_head {
                let mut updated = deduped[existing_idx].clone();
                updated.is_head = true;
                deduped[existing_idx] = updated;
            }
        } else {
            seen.insert(b.name.clone(), deduped.len());
            deduped.push(b);
        }
    }

    deduped.sort_by(|a, b| {
        let kind_ord = |k: &str| if k == "local" { 0u8 } else { 1u8 };
        kind_ord(&a.kind)
            .cmp(&kind_ord(&b.kind))
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(GitBranchListResult { branches: deduped })
}

fn push_worktree(
    branches: &mut Vec<GitBranchEntry>,
    path: String,
    branch: Option<String>,
    head_sha: Option<String>,
) {
    let name = if let Some(ref b) = branch {
        b.clone()
    } else if let Some(ref sha) = head_sha {
        let short = if sha.len() >= 7 { &sha[..7] } else { sha.as_str() };
        format!("(detached @ {short})")
    } else {
        return;
    };
    branches.push(GitBranchEntry {
        name,
        kind: "worktree".into(),
        worktree_path: Some(path),
        is_head: false,
        is_detached: branch.is_none(),
    });
}

pub async fn checkout_branch(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    name: &str,
) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    validate_branch_name(name)?;
    let output = backend
        .run(&repo_root, &["checkout", name], DEFAULT_TIMEOUT_SECS)
        .await?;
    ensure_success(&output, "git checkout failed")
}

pub async fn list_worktrees(
    backend: &GitBackend,
    host_id: &str,
    cwd: &str,
) -> Result<GitWorktreeListResult> {
    let cwd = prepare_cwd(backend, cwd)?;
    ensure_git_available(backend, host_id).await?;

    let Some(root_line) =
        git_stdout_line_opt(backend, &cwd, &["rev-parse", "--show-toplevel"]).await?
    else {
        return Ok(GitWorktreeListResult {
            worktrees: Vec::new(),
        });
    };
    let repo_root = prepare_cwd(backend, &root_line)?;

    let lines =
        git_stdout_lines(backend, &repo_root, &["worktree", "list", "--porcelain"]).await?;

    let mut worktrees: Vec<GitWorktreeEntry> = Vec::new();
    let mut current_path: Option<String> = None;
    let mut head: Option<String> = None;
    let mut branch: Option<String> = None;
    let mut bare = false;
    let mut detached = false;
    let mut locked = false;
    let mut prunable = false;

    let flush = |worktrees: &mut Vec<GitWorktreeEntry>,
                 path: Option<String>,
                 head: Option<String>,
                 branch: Option<String>,
                 bare: bool,
                 detached: bool,
                 locked: bool,
                 prunable: bool| {
        let Some(path) = path else {
            return;
        };
        if bare {
            return;
        }
        let is_main = worktrees.is_empty();
        worktrees.push(GitWorktreeEntry {
            path,
            head,
            branch,
            bare: false,
            detached,
            locked,
            prunable,
            is_main,
        });
    };

    for line in &lines {
        if let Some(rest) = line.strip_prefix("worktree ") {
            flush(
                &mut worktrees,
                current_path.take(),
                head.take(),
                branch.take(),
                bare,
                detached,
                locked,
                prunable,
            );
            current_path = Some(rest.trim().replace('\\', "/"));
            head = None;
            branch = None;
            bare = false;
            detached = false;
            locked = false;
            prunable = false;
        } else if let Some(rest) = line.strip_prefix("HEAD ") {
            head = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("branch ") {
            let raw = rest.trim();
            branch = Some(
                raw.strip_prefix("refs/heads/")
                    .unwrap_or(raw)
                    .to_string(),
            );
            detached = false;
        } else if line.starts_with("detached") {
            detached = true;
            branch = None;
        } else if line.starts_with("bare") {
            bare = true;
        } else if line.starts_with("locked") {
            locked = true;
        } else if line.starts_with("prunable") {
            prunable = true;
        }
    }
    flush(
        &mut worktrees,
        current_path.take(),
        head.take(),
        branch.take(),
        bare,
        detached,
        locked,
        prunable,
    );

    Ok(GitWorktreeListResult { worktrees })
}

pub async fn add_worktree(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    path: &str,
    branch: Option<&str>,
    create_branch: bool,
    start_point: Option<&str>,
) -> Result<GitWorktreeEntry> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let path = validate_worktree_path(path)?;

    let mut args: Vec<String> = vec!["worktree".into(), "add".into()];
    if create_branch {
        let branch = branch.ok_or_else(|| {
            GitError::new(
                GitErrorCode::InvalidPath,
                "branch name is required when creating a branch",
            )
        })?;
        validate_branch_name(branch)?;
        args.push("-b".into());
        args.push(branch.trim().to_string());
        args.push(path.clone());
        if let Some(start) = start_point.map(str::trim).filter(|s| !s.is_empty()) {
            if start.starts_with('-') || start.contains('\0') {
                return Err(GitError::new(
                    GitErrorCode::InvalidPath,
                    format!("invalid start point: {start}"),
                ));
            }
            args.push(start.to_string());
        }
    } else if let Some(branch) = branch.map(str::trim).filter(|s| !s.is_empty()) {
        validate_branch_name(branch)?;
        args.push(path.clone());
        args.push(branch.to_string());
    } else {
        args.push("--detach".into());
        args.push(path.clone());
        if let Some(start) = start_point.map(str::trim).filter(|s| !s.is_empty()) {
            if start.starts_with('-') || start.contains('\0') {
                return Err(GitError::new(
                    GitErrorCode::InvalidPath,
                    format!("invalid start point: {start}"),
                ));
            }
            args.push(start.to_string());
        }
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = backend
        .run(&repo_root, &arg_refs, DEFAULT_TIMEOUT_SECS)
        .await?;
    ensure_success(&output, "git worktree add failed")?;

    let listed = list_worktrees(backend, host_id, &repo_root).await?;
    listed
        .worktrees
        .into_iter()
        .find(|entry| paths_match(&entry.path, &path))
        .ok_or_else(|| {
            GitError::new(
                GitErrorCode::Internal,
                "worktree added but not found in list",
            )
        })
}

pub async fn remove_worktree(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    path: &str,
    force: bool,
) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let path = validate_worktree_path(path)?;

    let listed = list_worktrees(backend, host_id, &repo_root).await?;
    let target = listed
        .worktrees
        .iter()
        .find(|entry| paths_match(&entry.path, &path))
        .ok_or_else(|| {
            GitError::new(
                GitErrorCode::InvalidPath,
                format!("worktree not found: {path}"),
            )
        })?;
    if target.is_main {
        return Err(GitError::new(
            GitErrorCode::CommandFailed,
            "cannot remove the main worktree",
        ));
    }

    let mut args: Vec<String> = vec!["worktree".into(), "remove".into()];
    if force {
        args.push("--force".into());
    }
    args.push(path.clone());
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = backend
        .run(&repo_root, &arg_refs, DEFAULT_TIMEOUT_SECS)
        .await?;
    ensure_success(&output, "git worktree remove failed")
}

fn paths_match(a: &str, b: &str) -> bool {
    let normalize = |value: &str| {
        let trimmed = value.trim().replace('\\', "/");
        trimmed.trim_end_matches('/').to_string()
    };
    normalize(a) == normalize(b)
}

pub async fn create_branch(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    name: &str,
    checkout: bool,
) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    validate_branch_name(name)?;
    let output = if checkout {
        backend
            .run(
                &repo_root,
                &["checkout", "-b", name],
                DEFAULT_TIMEOUT_SECS,
            )
            .await?
    } else {
        backend
            .run(&repo_root, &["branch", name], DEFAULT_TIMEOUT_SECS)
            .await?
    };
    ensure_success(
        &output,
        if checkout {
            "git checkout -b failed"
        } else {
            "git branch failed"
        },
    )
}

pub async fn diff(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    path: Option<&str>,
    staged: bool,
) -> Result<GitDiffResult> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    diff_inner(backend, &repo_root, path, staged).await
}

async fn diff_inner(
    backend: &GitBackend,
    repo_root: &str,
    path: Option<&str>,
    staged: bool,
) -> Result<GitDiffResult> {
    let mut args: Vec<String> = vec!["diff".into(), "--no-ext-diff".into()];
    if staged {
        args.push("--cached".into());
    }
    let pathspec = match path.filter(|p| !p.is_empty()) {
        Some(p) => Some(literal_pathspec(&validate_repo_rel_path(p)?)),
        None => None,
    };
    if let Some(ref spec) = pathspec {
        args.push("--".into());
        args.push(spec.clone());
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = backend
        .run(repo_root, &arg_refs, DEFAULT_TIMEOUT_SECS)
        .await?;
    ensure_success(&output, "git diff failed")?;
    Ok(GitDiffResult {
        diff_text: stdout_to_string(output.stdout),
        truncated: output.truncated,
    })
}

pub async fn diff_content(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    path: &str,
    staged: bool,
    original_path: Option<&str>,
) -> Result<GitDiffContentResult> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let rel_path = validate_repo_rel_path(path)?;
    let original_rel = match original_path {
        Some(orig) if !orig.is_empty() => Some(validate_repo_rel_path(orig)?),
        _ => None,
    };

    let original = if staged {
        let spec_path = original_rel.as_deref().unwrap_or(&rel_path);
        let spec = format!("HEAD:{spec_path}");
        git_show_text(backend, &repo_root, &spec).await?
    } else {
        let spec = format!(":{rel_path}");
        git_show_text(backend, &repo_root, &spec).await?
    };

    let modified = if staged {
        let spec = format!(":{rel_path}");
        git_show_text(backend, &repo_root, &spec).await?
    } else if is_local(backend) {
        read_local_text_file(&repo_root, &rel_path)?
    } else {
        // Remote worktree file reads are not available via the runner.
        TextSource::Missing
    };

    let patch = diff_inner(backend, &repo_root, Some(&rel_path), staged).await?;
    let is_binary =
        matches!(original, TextSource::Binary) || matches!(modified, TextSource::Binary);

    Ok(GitDiffContentResult {
        original_content: original.into_text(),
        modified_content: modified.into_text(),
        is_binary,
        fallback_patch: patch.diff_text,
        truncated: patch.truncated,
    })
}

pub async fn fetch(backend: &GitBackend, host_id: &str, repo_root: &str) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let output = backend
        .run(
            &repo_root,
            &["fetch", "--prune"],
            NETWORK_TIMEOUT_SECS,
        )
        .await?;
    ensure_network_success(&output, "git fetch failed")
}

pub async fn pull_ff_only(backend: &GitBackend, host_id: &str, repo_root: &str) -> Result<()> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let output = backend
        .run(
            &repo_root,
            &["pull", "--ff-only"],
            NETWORK_TIMEOUT_SECS,
        )
        .await?;
    ensure_network_success(&output, "git pull --ff-only failed")
}

pub async fn push(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
) -> Result<GitPushResult> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;

    let upstream = git_stdout_line_opt(
        backend,
        &repo_root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .await?;
    if upstream.is_none() {
        return Err(GitError::new(
            GitErrorCode::NoUpstream,
            "current branch has no upstream",
        ));
    }

    let output = backend
        .run(&repo_root, &["push"], NETWORK_TIMEOUT_SECS)
        .await?;
    ensure_network_success(&output, "git push failed")?;

    let upstream = upstream.unwrap();
    let (remote, branch) = split_upstream(&upstream);
    Ok(GitPushResult {
        remote,
        branch,
        pushed: true,
    })
}

pub async fn show_commit_diff(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    sha: &str,
) -> Result<GitDiffResult> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    if !sha_is_safe(sha) {
        return Err(GitError::command("git show", "invalid commit identifier"));
    }
    let output = backend
        .run(
            &repo_root,
            &[
                "show",
                "--no-color",
                "--no-ext-diff",
                "--patch-with-stat",
                sha,
                "--",
            ],
            DEFAULT_TIMEOUT_SECS,
        )
        .await?;
    ensure_success(&output, "git show failed")?;
    Ok(GitDiffResult {
        diff_text: stdout_to_string(output.stdout),
        truncated: output.truncated,
    })
}

pub async fn commit_files(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    sha: &str,
) -> Result<Vec<GitCommitFileChange>> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    if !sha_is_safe(sha) {
        return Err(GitError::command("git diff-tree", "invalid commit sha"));
    }

    let name_status = backend
        .run(
            &repo_root,
            &[
                "diff-tree",
                "--no-commit-id",
                "--root",
                "-r",
                "-M",
                "-z",
                "--name-status",
                sha,
            ],
            DEFAULT_TIMEOUT_SECS,
        )
        .await?;
    ensure_success(&name_status, "git diff-tree --name-status failed")?;

    let numstat = backend
        .run(
            &repo_root,
            &[
                "diff-tree",
                "--no-commit-id",
                "--root",
                "-r",
                "-M",
                "-z",
                "--numstat",
                sha,
            ],
            DEFAULT_TIMEOUT_SECS,
        )
        .await?;
    ensure_success(&numstat, "git diff-tree --numstat failed")?;

    let mut files = parse_diff_tree_name_status(&name_status.stdout);
    apply_numstat(&mut files, &numstat.stdout);
    Ok(files)
}

fn parse_diff_tree_name_status(bytes: &[u8]) -> Vec<GitCommitFileChange> {
    let s = std::str::from_utf8(bytes).unwrap_or("");
    let mut tokens = s.split('\0').filter(|t| !t.is_empty());
    let mut files: Vec<GitCommitFileChange> = Vec::new();
    while let Some(status_tok) = tokens.next() {
        let status_char = status_tok.chars().next().unwrap_or(' ');
        if status_char == 'R' || status_char == 'C' {
            let original = match tokens.next() {
                Some(v) => v.to_string(),
                None => break,
            };
            let new_path = match tokens.next() {
                Some(v) => v.to_string(),
                None => break,
            };
            files.push(GitCommitFileChange {
                path: new_path,
                original_path: Some(original),
                status: status_char.to_string(),
                status_label: status_label_for(status_char),
                added: 0,
                removed: 0,
                is_binary: false,
            });
        } else {
            let path = match tokens.next() {
                Some(v) => v.to_string(),
                None => break,
            };
            files.push(GitCommitFileChange {
                path,
                original_path: None,
                status: status_char.to_string(),
                status_label: status_label_for(status_char),
                added: 0,
                removed: 0,
                is_binary: false,
            });
        }
    }
    files
}

fn apply_numstat(files: &mut [GitCommitFileChange], bytes: &[u8]) {
    let s = std::str::from_utf8(bytes).unwrap_or("");
    let tokens: Vec<&str> = s.split('\0').filter(|t| !t.is_empty()).collect();
    let mut idx = 0;
    while idx < tokens.len() {
        let header = tokens[idx];
        idx += 1;
        let mut cols = header.splitn(3, '\t');
        let added_raw = cols.next().unwrap_or("0");
        let removed_raw = cols.next().unwrap_or("0");
        let inline_path = cols.next().unwrap_or("");
        let is_binary = added_raw == "-" && removed_raw == "-";
        let added: u32 = if is_binary {
            0
        } else {
            added_raw.parse().unwrap_or(0)
        };
        let removed: u32 = if is_binary {
            0
        } else {
            removed_raw.parse().unwrap_or(0)
        };

        let (path, original) = if inline_path.is_empty() {
            let original = tokens.get(idx).map(|s| s.to_string()).unwrap_or_default();
            idx += 1;
            let new_path = tokens.get(idx).map(|s| s.to_string()).unwrap_or_default();
            idx += 1;
            (new_path, Some(original))
        } else {
            (inline_path.to_string(), None)
        };

        if path.is_empty() {
            continue;
        }
        if let Some(file) = files.iter_mut().find(|f| f.path == path) {
            file.added = added;
            file.removed = removed;
            file.is_binary = is_binary;
            if file.original_path.is_none() {
                if let Some(orig) = original {
                    if !orig.is_empty() && orig != file.path {
                        file.original_path = Some(orig);
                    }
                }
            }
        }
    }
}

pub async fn commit_file_diff(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    sha: &str,
    path: &str,
    original_path: Option<&str>,
) -> Result<GitDiffContentResult> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    if !sha_is_safe(sha) {
        return Err(GitError::command("git show", "invalid commit sha"));
    }
    let rel = validate_repo_rel_path(path)?;
    let original_rel = match original_path {
        Some(orig) if !orig.is_empty() => validate_repo_rel_path(orig)?,
        _ => rel.clone(),
    };

    let parent_arg = format!("{sha}^");
    let parent = git_stdout_line_opt(backend, &repo_root, &["rev-parse", &parent_arg]).await?;
    let original = match parent.as_deref() {
        Some(p) => {
            let spec = format!("{p}:{original_rel}");
            git_show_text(backend, &repo_root, &spec).await?
        }
        None => TextSource::Missing,
    };
    let modified_spec = format!("{sha}:{rel}");
    let modified = git_show_text(backend, &repo_root, &modified_spec).await?;

    let mut diff_args: Vec<String> = vec![
        "show".into(),
        "--no-color".into(),
        "--no-ext-diff".into(),
        "--format=".into(),
        "-m".into(),
        "--first-parent".into(),
        sha.into(),
        "--".into(),
        literal_pathspec(&rel),
    ];
    if original_rel != rel {
        diff_args.push(literal_pathspec(&original_rel));
    }
    let arg_refs: Vec<&str> = diff_args.iter().map(|s| s.as_str()).collect();
    let patch_output = backend
        .run(&repo_root, &arg_refs, DEFAULT_TIMEOUT_SECS)
        .await?;
    ensure_success(&patch_output, "git show <commit> -- <path> failed")?;

    let is_binary =
        matches!(original, TextSource::Binary) || matches!(modified, TextSource::Binary);

    Ok(GitDiffContentResult {
        original_content: original.into_text(),
        modified_content: modified.into_text(),
        is_binary,
        fallback_patch: stdout_to_string(patch_output.stdout),
        truncated: patch_output.truncated,
    })
}

pub async fn remote_url(
    backend: &GitBackend,
    host_id: &str,
    repo_root: &str,
    name: Option<&str>,
) -> Result<Option<String>> {
    let repo_root = prepare_cwd(backend, repo_root)?;
    ensure_git_available(backend, host_id).await?;
    let name = name.unwrap_or("origin");
    if name.is_empty() || name.len() > 64 || !name.chars().all(is_remote_name_char) {
        return Ok(None);
    }
    let key = format!("remote.{name}.url");
    git_stdout_line_opt(backend, &repo_root, &["config", "--get", &key]).await
}
