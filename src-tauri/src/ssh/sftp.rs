use std::sync::Arc;

use russh_sftp::client::SftpSession;

use super::connection::handle_is_closed;
use super::error::{SshError, SshErrorCode};
use super::host_fs::{
    FsEntry, FsListConfig, FsListResult, FsMkdirConfig, FsReadConfig, FsRemoveConfig,
    FsRenameConfig, FsWriteConfig,
};
use super::manager::SshManager;

const MAX_TRANSFER_BYTES: usize = 32 * 1024 * 1024;

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
    pub(crate) async fn ensure_sftp(&self, host_id: &str) -> Result<Arc<SftpSession>, SshError> {
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
}

pub(crate) async fn remote_list(
    manager: &SshManager,
    config: FsListConfig,
) -> Result<FsListResult, SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
    let requested = if config.path.trim().is_empty() {
        ".".to_string()
    } else {
        config.path
    };
    let path = session
        .canonicalize(&requested)
        .await
        .map_err(map_sftp_err)?;
    let mut entries: Vec<FsEntry> = session
        .read_dir(&path)
        .await
        .map_err(map_sftp_err)?
        .map(|entry| {
            let name = entry.file_name();
            let is_dir = entry.file_type().is_dir();
            let meta = entry.metadata();
            let size = meta.size.unwrap_or(0);
            let mtime = meta.mtime;
            let entry_path = entry.path();
            FsEntry {
                path: if entry_path.is_empty() {
                    join_path(&path, &name)
                } else {
                    entry_path
                },
                name,
                is_dir,
                size,
                mtime,
            }
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(FsListResult { path, entries })
}

pub(crate) async fn remote_read(
    manager: &SshManager,
    config: FsReadConfig,
) -> Result<Vec<u8>, SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
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

pub(crate) async fn remote_write(
    manager: &SshManager,
    config: FsWriteConfig,
) -> Result<(), SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
    session
        .write(&config.path, &config.data)
        .await
        .map_err(map_sftp_err)
}

pub(crate) async fn remote_mkdir(
    manager: &SshManager,
    config: FsMkdirConfig,
) -> Result<(), SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
    session
        .create_dir(&config.path)
        .await
        .map_err(map_sftp_err)
}

pub(crate) async fn remote_remove(
    manager: &SshManager,
    config: FsRemoveConfig,
) -> Result<(), SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
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

pub(crate) async fn remote_rename(
    manager: &SshManager,
    config: FsRenameConfig,
) -> Result<(), SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
    session
        .rename(&config.from, &config.to)
        .await
        .map_err(map_sftp_err)
}
