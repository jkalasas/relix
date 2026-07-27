use tauri::{AppHandle, State};

use super::error::SshError;
use super::manager::{
    ConnectConfig, OpenShellResult, SshManager, StartDynamicForwardConfig,
    StartLocalForwardConfig, StartRemoteForwardConfig,
};
use super::sftp::{
    SftpListConfig, SftpListResult, SftpMkdirConfig, SftpReadConfig, SftpRemoveConfig,
    SftpRenameConfig, SftpWriteConfig,
};

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
pub async fn ssh_sftp_list(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: SftpListConfig,
) -> Result<SftpListResult, SshError> {
    state.sftp_list(&app, config).await
}

#[tauri::command]
pub async fn ssh_sftp_read(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: SftpReadConfig,
) -> Result<Vec<u8>, SshError> {
    state.sftp_read(&app, config).await
}

#[tauri::command]
pub async fn ssh_sftp_write(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: SftpWriteConfig,
) -> Result<(), SshError> {
    state.sftp_write(&app, config).await
}

#[tauri::command]
pub async fn ssh_sftp_mkdir(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: SftpMkdirConfig,
) -> Result<(), SshError> {
    state.sftp_mkdir(&app, config).await
}

#[tauri::command]
pub async fn ssh_sftp_remove(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: SftpRemoveConfig,
) -> Result<(), SshError> {
    state.sftp_remove(&app, config).await
}

#[tauri::command]
pub async fn ssh_sftp_rename(
    app: AppHandle,
    state: State<'_, SshManager>,
    config: SftpRenameConfig,
) -> Result<(), SshError> {
    state.sftp_rename(&app, config).await
}
