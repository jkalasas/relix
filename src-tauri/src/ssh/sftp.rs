use std::sync::Arc;

use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::connection::handle_is_closed;
use super::error::{SshError, SshErrorCode};
use super::manager::SshManager;

const MAX_TRANSFER_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpListResult {
    pub path: String,
    pub entries: Vec<SftpEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpListConfig {
    pub host_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpReadConfig {
    pub host_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpWriteConfig {
    pub host_id: String,
    pub path: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpMkdirConfig {
    pub host_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpRemoveConfig {
    pub host_id: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpRenameConfig {
    pub host_id: String,
    pub from: String,
    pub to: String,
}

pub(crate) struct LiveSftp {
    pub(crate) session: Arc<SftpSession>,
}

fn map_sftp_err(err: impl std::fmt::Display) -> SshError {
    SshError::new(SshErrorCode::TransferFailed, err.to_string())
}

fn join_path(parent: &str, name: &str) -> String {
    if parent.is_empty() || parent == "." {
        return name.to_string();
    }
    if parent.ends_with('/') {
        format!("{parent}{name}")
    } else {
        format!("{parent}/{name}")
    }
}

impl SshManager {
    async fn ensure_sftp(&self, host_id: &str) -> Result<Arc<SftpSession>, SshError> {
        {
            let inner = self.inner.lock().await;
            if let Some(existing) = inner.sftp.get(host_id) {
                return Ok(Arc::clone(&existing.session));
            }
        }

        let handle = {
            let mut inner = self.inner.lock().await;
            match inner.connections.get(host_id) {
                Some(conn) if !handle_is_closed(&conn.handle) => Arc::clone(&conn.handle),
                Some(_) => {
                    inner.connections.remove(host_id);
                    return Err(SshError::new(
                        SshErrorCode::NotConnected,
                        "Host is not connected",
                    ));
                }
                None => {
                    return Err(SshError::new(
                        SshErrorCode::NotConnected,
                        "Host is not connected",
                    ));
                }
            }
        };

        let channel = {
            let guard = handle.lock().await;
            guard.channel_open_session().await.map_err(|e| {
                SshError::new(
                    SshErrorCode::TransferFailed,
                    format!("Could not open SFTP channel: {e}"),
                )
            })?
        };

        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| {
                SshError::new(
                    SshErrorCode::TransferFailed,
                    format!("Remote refused SFTP subsystem: {e}"),
                )
            })?;

        let session = SftpSession::new(channel.into_stream())
            .await
            .map_err(map_sftp_err)?;
        let session = Arc::new(session);

        {
            let mut inner = self.inner.lock().await;
            if !inner.connections.contains_key(host_id) {
                let _ = session.close().await;
                return Err(SshError::new(
                    SshErrorCode::NotConnected,
                    "Host is not connected",
                ));
            }
            if let Some(existing) = inner.sftp.get(host_id) {
                let _ = session.close().await;
                return Ok(Arc::clone(&existing.session));
            }
            inner.sftp.insert(
                host_id.to_string(),
                LiveSftp {
                    session: Arc::clone(&session),
                },
            );
        }

        Ok(session)
    }

    pub async fn sftp_list(
        &self,
        _app: &AppHandle,
        config: SftpListConfig,
    ) -> Result<SftpListResult, SshError> {
        let session = self.ensure_sftp(&config.host_id).await?;
        let requested = if config.path.trim().is_empty() {
            ".".to_string()
        } else {
            config.path
        };
        let path = session
            .canonicalize(&requested)
            .await
            .map_err(map_sftp_err)?;
        let mut entries: Vec<SftpEntry> = session
            .read_dir(&path)
            .await
            .map_err(map_sftp_err)?
            .map(|entry| {
                let name = entry.file_name();
                let is_dir = entry.file_type().is_dir();
                let size = entry.metadata().size.unwrap_or(0);
                let entry_path = entry.path();
                SftpEntry {
                    path: if entry_path.is_empty() {
                        join_path(&path, &name)
                    } else {
                        entry_path
                    },
                    name,
                    is_dir,
                    size,
                }
            })
            .collect();

        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(SftpListResult { path, entries })
    }

    pub async fn sftp_read(
        &self,
        _app: &AppHandle,
        config: SftpReadConfig,
    ) -> Result<Vec<u8>, SshError> {
        let session = self.ensure_sftp(&config.host_id).await?;
        let meta = session.metadata(&config.path).await.map_err(map_sftp_err)?;
        let size = meta.size.unwrap_or(0) as usize;
        if size > MAX_TRANSFER_BYTES {
            return Err(SshError::new(
                SshErrorCode::TransferFailed,
                format!(
                    "File is too large to download in-app ({} bytes; max {} bytes)",
                    size, MAX_TRANSFER_BYTES
                ),
            ));
        }
        session.read(&config.path).await.map_err(map_sftp_err)
    }

    pub async fn sftp_write(
        &self,
        _app: &AppHandle,
        config: SftpWriteConfig,
    ) -> Result<(), SshError> {
        if config.data.len() > MAX_TRANSFER_BYTES {
            return Err(SshError::new(
                SshErrorCode::TransferFailed,
                format!(
                    "File is too large to upload in-app ({} bytes; max {} bytes)",
                    config.data.len(),
                    MAX_TRANSFER_BYTES
                ),
            ));
        }
        let session = self.ensure_sftp(&config.host_id).await?;
        session
            .write(&config.path, &config.data)
            .await
            .map_err(map_sftp_err)
    }

    pub async fn sftp_mkdir(
        &self,
        _app: &AppHandle,
        config: SftpMkdirConfig,
    ) -> Result<(), SshError> {
        let session = self.ensure_sftp(&config.host_id).await?;
        session
            .create_dir(&config.path)
            .await
            .map_err(map_sftp_err)
    }

    pub async fn sftp_remove(
        &self,
        _app: &AppHandle,
        config: SftpRemoveConfig,
    ) -> Result<(), SshError> {
        let session = self.ensure_sftp(&config.host_id).await?;
        if config.is_dir {
            session
                .remove_dir(&config.path)
                .await
                .map_err(map_sftp_err)
        } else {
            session
                .remove_file(&config.path)
                .await
                .map_err(map_sftp_err)
        }
    }

    pub async fn sftp_rename(
        &self,
        _app: &AppHandle,
        config: SftpRenameConfig,
    ) -> Result<(), SshError> {
        let session = self.ensure_sftp(&config.host_id).await?;
        session
            .rename(&config.from, &config.to)
            .await
            .map_err(map_sftp_err)
    }
}
