use tauri::{AppHandle, State};

use super::error::SshError;
use super::manager::{ConnectConfig, SshManager};

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
