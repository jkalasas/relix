use tauri::State;

use crate::git::error::GitError;
use crate::git::operations;
use crate::git::runner::backend_for_host;
use crate::git::types::*;
use crate::ssh::manager::SshManager;

#[tauri::command]
pub async fn git_resolve_repo(
    host_id: String,
    cwd: String,
    state: State<'_, SshManager>,
) -> Result<Option<GitRepoInfo>, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::resolve_repo(&backend, &host_id, &cwd).await
}

#[tauri::command]
pub async fn git_panel_snapshot(
    host_id: String,
    cwd: String,
    state: State<'_, SshManager>,
) -> Result<GitPanelSnapshot, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::panel_snapshot(&backend, &host_id, &cwd).await
}

#[tauri::command]
pub async fn git_status(
    host_id: String,
    repo_root: String,
    state: State<'_, SshManager>,
) -> Result<GitStatusSnapshot, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::status(&backend, &host_id, &repo_root).await
}

#[tauri::command]
pub async fn git_diff(
    host_id: String,
    repo_root: String,
    path: Option<String>,
    staged: bool,
    state: State<'_, SshManager>,
) -> Result<GitDiffResult, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::diff(&backend, &host_id, &repo_root, path.as_deref(), staged).await
}

#[tauri::command]
pub async fn git_diff_content(
    host_id: String,
    repo_root: String,
    path: String,
    staged: bool,
    original_path: Option<String>,
    state: State<'_, SshManager>,
) -> Result<GitDiffContentResult, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::diff_content(
        &backend,
        &host_id,
        &repo_root,
        &path,
        staged,
        original_path.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn git_stage(
    host_id: String,
    repo_root: String,
    paths: Vec<String>,
    state: State<'_, SshManager>,
) -> Result<(), GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::stage(&backend, &host_id, &repo_root, &paths).await
}

#[tauri::command]
pub async fn git_unstage(
    host_id: String,
    repo_root: String,
    paths: Vec<String>,
    state: State<'_, SshManager>,
) -> Result<(), GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::unstage(&backend, &host_id, &repo_root, &paths).await
}

#[tauri::command]
pub async fn git_discard(
    host_id: String,
    repo_root: String,
    entries: Vec<DiscardEntry>,
    state: State<'_, SshManager>,
) -> Result<(), GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::discard(&backend, &host_id, &repo_root, &entries).await
}

#[tauri::command]
pub async fn git_commit(
    host_id: String,
    repo_root: String,
    message: String,
    state: State<'_, SshManager>,
) -> Result<GitCommitResult, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::commit(&backend, &host_id, &repo_root, &message).await
}

#[tauri::command]
pub async fn git_fetch(
    host_id: String,
    repo_root: String,
    state: State<'_, SshManager>,
) -> Result<(), GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::fetch(&backend, &host_id, &repo_root).await
}

#[tauri::command]
pub async fn git_pull_ff_only(
    host_id: String,
    repo_root: String,
    state: State<'_, SshManager>,
) -> Result<(), GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::pull_ff_only(&backend, &host_id, &repo_root).await
}

#[tauri::command]
pub async fn git_push(
    host_id: String,
    repo_root: String,
    state: State<'_, SshManager>,
) -> Result<GitPushResult, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::push(&backend, &host_id, &repo_root).await
}

#[tauri::command]
pub async fn git_log(
    host_id: String,
    repo_root: String,
    limit: Option<u32>,
    before_sha: Option<String>,
    state: State<'_, SshManager>,
) -> Result<Vec<GitLogEntry>, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::log(
        &backend,
        &host_id,
        &repo_root,
        limit.unwrap_or(MAX_LOG_LIMIT),
        before_sha.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn git_show_commit(
    host_id: String,
    repo_root: String,
    sha: String,
    state: State<'_, SshManager>,
) -> Result<GitDiffResult, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::show_commit_diff(&backend, &host_id, &repo_root, &sha).await
}

#[tauri::command]
pub async fn git_commit_files(
    host_id: String,
    repo_root: String,
    sha: String,
    state: State<'_, SshManager>,
) -> Result<Vec<GitCommitFileChange>, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::commit_files(&backend, &host_id, &repo_root, &sha).await
}

#[tauri::command]
pub async fn git_commit_file_diff(
    host_id: String,
    repo_root: String,
    sha: String,
    path: String,
    original_path: Option<String>,
    state: State<'_, SshManager>,
) -> Result<GitDiffContentResult, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::commit_file_diff(
        &backend,
        &host_id,
        &repo_root,
        &sha,
        &path,
        original_path.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn git_list_branches(
    host_id: String,
    repo_root: String,
    state: State<'_, SshManager>,
) -> Result<GitBranchListResult, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::list_branches(&backend, &host_id, &repo_root).await
}

#[tauri::command]
pub async fn git_checkout_branch(
    host_id: String,
    repo_root: String,
    branch: String,
    state: State<'_, SshManager>,
) -> Result<(), GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::checkout_branch(&backend, &host_id, &repo_root, &branch).await
}

#[tauri::command]
pub async fn git_create_branch(
    host_id: String,
    repo_root: String,
    name: String,
    checkout: bool,
    state: State<'_, SshManager>,
) -> Result<(), GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::create_branch(&backend, &host_id, &repo_root, &name, checkout).await
}

#[tauri::command]
pub async fn git_remote_url(
    host_id: String,
    repo_root: String,
    name: Option<String>,
    state: State<'_, SshManager>,
) -> Result<Option<String>, GitError> {
    let backend = backend_for_host(&host_id, &state).await?;
    operations::remote_url(&backend, &host_id, &repo_root, name.as_deref()).await
}
