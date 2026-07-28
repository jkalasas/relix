use tauri::{AppHandle, State};

use super::error::SshError;
use super::local_shell;
use super::manager::{
    ConnectConfig, OpenShellResult, SshManager, StartDynamicForwardConfig,
    StartLocalForwardConfig, StartRemoteForwardConfig,
};
use super::host_fs::{
    FsListConfig, FsListResult, FsMkdirConfig, FsReadConfig, FsRemoveConfig, FsRenameConfig,
    FsWriteConfig,
};
use super::tmux::{TmuxBootstrapResult, TmuxWindow};

#[tauri::command]
pub fn local_shell_available() -> bool {
    local_shell::local_shell_available()
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: ConnectConfig,
) -> Result<(), SshError> {
    state.connect(&app, config).await
}

#[tauri::command]
pub async fn ssh_disconnect(
    app: AppHandle,
    state: State<'_, SshManager>,
    host_id: String,
) -> Result<(), SshError> {
    state.disconnect(&app, &host_id).await
}

#[tauri::command]
pub async fn ssh_cancel_connect(
    state: State<'_, SshManager>,
    host_id: String,
) -> Result<(), SshError> {
    state.cancel_connect(&host_id).await
}

#[tauri::command]
pub async fn ssh_open_shell(
    app: AppHandle,
    state: State<'_, SshManager>,
    host_id: String,
    cols: Option<u32>,
    rows: Option<u32>,
    command: Option<String>,
    cwd: Option<String>,
) -> Result<OpenShellResult, SshError> {
    state
        .open_shell(
            &app,
            host_id,
            cols.unwrap_or(80),
            rows.unwrap_or(24),
            command,
            cwd,
        )
        .await
}

#[tauri::command]
pub async fn ssh_close_shell(
    app: AppHandle,
    state: State<'_, SshManager>,
    session_id: String,
) -> Result<(), SshError> {
    state.close_shell(&app, &session_id).await
}

#[tauri::command]
pub async fn ssh_write(
    state: State<'_, SshManager>,
    session_id: String,
    data: String,
) -> Result<(), SshError> {
    state.write(&session_id, &data).await
}

#[tauri::command]
pub async fn ssh_resize(
    state: State<'_, SshManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), SshError> {
    state.resize(&session_id, cols, rows).await
}

#[tauri::command]
pub async fn ssh_trust_host_key(
    app: AppHandle,
    state: State<'_, SshManager>,
    hostname: String,
    port: u16,
    algorithm: String,
    key_base64: String,
) -> Result<(), SshError> {
    state
        .trust_host_key(&app, hostname, port, algorithm, key_base64)
        .await
}

#[tauri::command]
pub async fn ssh_start_local_forward(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: StartLocalForwardConfig,
) -> Result<(), SshError> {
    state.start_local_forward(&app, config).await
}

#[tauri::command]
pub async fn ssh_start_remote_forward(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: StartRemoteForwardConfig,
) -> Result<(), SshError> {
    state.start_remote_forward(&app, config).await
}

#[tauri::command]
pub async fn ssh_start_dynamic_forward(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: StartDynamicForwardConfig,
) -> Result<(), SshError> {
    state.start_dynamic_forward(&app, config).await
}

#[tauri::command]
pub async fn ssh_stop_forward(
    app: AppHandle,
    state: State<'_, SshManager>,
    forward_id: String,
) -> Result<(), SshError> {
    state.stop_forward(&app, &forward_id).await
}

#[tauri::command]
pub async fn host_fs_list(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: FsListConfig,
) -> Result<FsListResult, SshError> {
    state.fs_list(&app, config).await
}

#[tauri::command]
pub async fn host_fs_read(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: FsReadConfig,
) -> Result<Vec<u8>, SshError> {
    state.fs_read(&app, config).await
}

#[tauri::command]
pub async fn host_fs_write(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: FsWriteConfig,
) -> Result<(), SshError> {
    state.fs_write(&app, config).await
}

#[tauri::command]
pub async fn host_fs_mkdir(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: FsMkdirConfig,
) -> Result<(), SshError> {
    state.fs_mkdir(&app, config).await
}

#[tauri::command]
pub async fn host_fs_remove(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: FsRemoveConfig,
) -> Result<(), SshError> {
    state.fs_remove(&app, config).await
}

#[tauri::command]
pub async fn host_fs_rename(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: FsRenameConfig,
) -> Result<(), SshError> {
    state.fs_rename(&app, config).await
}

#[tauri::command]
pub async fn ssh_tmux_bootstrap(
    state: State<'_, SshManager>,
    host_id: String,
    session: Option<String>,
) -> Result<TmuxBootstrapResult, SshError> {
    state.tmux_bootstrap(host_id, session).await
}

#[tauri::command]
pub async fn ssh_tmux_new_window(
    state: State<'_, SshManager>,
    host_id: String,
    session: Option<String>,
    name: Option<String>,
    command: Option<String>,
    cwd: Option<String>,
    source_window_id: Option<String>,
) -> Result<TmuxWindow, SshError> {
    state
        .tmux_new_window(host_id, session, name, command, cwd, source_window_id)
        .await
}

#[tauri::command]
pub async fn ssh_tmux_list_windows(
    state: State<'_, SshManager>,
    host_id: String,
    session: Option<String>,
) -> Result<TmuxBootstrapResult, SshError> {
    state.tmux_list_windows(host_id, session).await
}

#[tauri::command]
pub async fn ssh_tmux_window_path(
    state: State<'_, SshManager>,
    host_id: String,
    session: Option<String>,
    window_id: String,
) -> Result<Option<String>, SshError> {
    state.tmux_window_path(host_id, session, window_id).await
}

#[tauri::command]
pub async fn ssh_tmux_kill_window(
    state: State<'_, SshManager>,
    host_id: String,
    session: Option<String>,
    window_id: String,
) -> Result<(), SshError> {
    state.tmux_kill_window(host_id, session, window_id).await
}

#[tauri::command]
pub async fn ssh_tmux_kill_session(
    state: State<'_, SshManager>,
    host_id: String,
    session: Option<String>,
) -> Result<(), SshError> {
    state.tmux_kill_session(host_id, session).await
}
