use tauri::{AppHandle, State};

use super::error::SshError;
use super::manager::{ConnectConfig, OpenShellResult, SshManager, StartLocalForwardConfig};

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
pub async fn ssh_open_shell(
    app: AppHandle,
    state: State<'_, SshManager>,
    host_id: String,
    cols: Option<u32>,
    rows: Option<u32>,
) -> Result<OpenShellResult, SshError> {
    state
        .open_shell(&app, host_id, cols.unwrap_or(80), rows.unwrap_or(24))
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
pub async fn ssh_stop_forward(
    app: AppHandle,
    state: State<'_, SshManager>,
    forward_id: String,
) -> Result<(), SshError> {
    state.stop_forward(&app, &forward_id).await
}
