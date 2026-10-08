use std::sync::Arc;

use tokio::io::{AsyncSeekExt as _, AsyncWriteExt as _};

use russh_sftp::client::SftpSession;
use russh_sftp::client::error::Error as SftpError;
use russh_sftp::protocol::{OpenFlags, StatusCode};

use super::connection::handle_is_closed;
use super::error::{SshError, SshErrorCode};
use super::host_fs::{
    FsEntry, FsListConfig, FsListResult, FsMkdirConfig, FsReadConfig, FsRemoveConfig,
    FsRenameConfig, FsWriteChunkConfig, FsWriteConfig,
};
use super::manager::SshManager;

const MAX_TRANSFER_BYTES: usize = 32 * 1024 * 1024;

pub(crate) struct LiveSftp {
    pub(crate) session: Arc<SftpSession>,
}

fn dedupe_status_text(code: StatusCode, server_message: &str) -> String {
    let code_text = code.to_string();
    let msg = server_message.trim();
    if msg.is_empty() || msg.eq_ignore_ascii_case(&code_text) {
        return code_text;
    }
    // Some servers echo the code text as a "{code}: {detail}" prefix (e.g.
    // OpenSSH sftp-server replies "No such file" to a NoSuchFile status,
    // which would otherwise render as "No such file: No such file").
    // Only strip when the echo is followed by a separator; a message that
    // merely starts with the same words ("No such file or directory...")
    // is kept whole.
    let lower_msg = msg.to_lowercase();
    let lower_code = code_text.to_lowercase();
    if let Some(rest) = lower_msg.strip_prefix(&lower_code) {
        if rest.is_empty() {
            return code_text;
        }
        if matches!(rest.chars().next(), Some(':' | '-' | '\u{2013}')) {
            let detail = rest.trim_start_matches([':', '-', '\u{2013}', ' ']);
            if detail.is_empty() {
                return code_text;
            }
            let cut = msg.len() - detail.len();
            return msg[cut..].trim().to_string();
        }
    }
    msg.to_string()
}

fn map_status_err(
    code: StatusCode,
    server_message: &str,
    path: &str,
) -> SshError {
    let detail = dedupe_status_text(code, server_message);
    let message = if path.trim().is_empty() {
        detail
    } else {
        format!("{}: {}", detail, path.trim())
    };
    let code = match code {
        StatusCode::NoSuchFile => SshErrorCode::NotFound,
        _ => SshErrorCode::TransferFailed,
    };
    SshError::new(code, message)
}

fn map_sftp_err_path(err: SftpError, path: &str) -> SshError {
    match err {
        SftpError::Status(status) => {
            map_status_err(status.status_code, &status.error_message, path)
        }
        other => SshError::new(SshErrorCode::TransferFailed, other.to_string()),
    }
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
            .map_err(|e| map_sftp_err_path(e, ""))?;
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
        .map_err(|e| map_sftp_err_path(e, &requested))?;
    let mut entries: Vec<FsEntry> = session
        .read_dir(&path)
        .await
        .map_err(|e| map_sftp_err_path(e, &path))?
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
    let meta = session
        .metadata(&config.path)
        .await
        .map_err(|e| map_sftp_err_path(e, &config.path))?;
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
    session
        .read(&config.path)
        .await
        .map_err(|e| map_sftp_err_path(e, &config.path))
}

pub(crate) async fn remote_write(
    manager: &SshManager,
    config: FsWriteConfig,
) -> Result<(), SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
    // NOTE: `SftpSession::write` opens with WRITE only and fails with
    // NoSuchFile on missing files — `create` opens with
    // CREATE|TRUNCATE|WRITE, so new files (first registry save, uploads)
    // work. Dropping `File` closes the handle, same as before.
    let mut file = session
        .create(&config.path)
        .await
        .map_err(|e| map_sftp_err_path(e, &config.path))?;
    file.write_all(&config.data)
        .await
        .map_err(|e| {
            SshError::new(
                SshErrorCode::TransferFailed,
                format!("Could not write {}: {e}", config.path),
            )
        })
}

pub(crate) async fn remote_write_chunk(
    manager: &SshManager,
    config: FsWriteChunkConfig,
) -> Result<(), SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
    let mut flags = OpenFlags::WRITE | OpenFlags::CREATE;
    if config.truncate {
        flags |= OpenFlags::TRUNCATE;
    }
    let mut file = session
        .open_with_flags(&config.path, flags)
        .await
        .map_err(|e| map_sftp_err_path(e, &config.path))?;
    file.seek(std::io::SeekFrom::Start(config.offset))
        .await
        .map_err(|e| {
            SshError::new(
                SshErrorCode::TransferFailed,
                format!("Could not write {}: {e}", config.path),
            )
        })?;
    file.write_all(&config.data).await.map_err(|e| {
        SshError::new(
            SshErrorCode::TransferFailed,
            format!("Could not write {}: {e}", config.path),
        )
    })?;
    file.flush().await.map_err(|e| {
        SshError::new(
            SshErrorCode::TransferFailed,
            format!("Could not write {}: {e}", config.path),
        )
    })
}

pub(crate) async fn remote_mkdir(
    manager: &SshManager,
    config: FsMkdirConfig,
) -> Result<(), SshError> {
    let session = manager.ensure_sftp(&config.host_id).await?;
    session
        .create_dir(&config.path)
        .await
        .map_err(|e| map_sftp_err_path(e, &config.path))
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
            .map_err(|e| map_sftp_err_path(e, &config.path))
    } else {
        session
            .remove_file(&config.path)
            .await
            .map_err(|e| map_sftp_err_path(e, &config.path))
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
        .map_err(|e| map_sftp_err_path(e, &config.from))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupes_echoed_no_such_file() {
        assert_eq!(
            dedupe_status_text(StatusCode::NoSuchFile, "No such file"),
            "No such file"
        );
        assert_eq!(
            dedupe_status_text(StatusCode::NoSuchFile, "No such file: No such file"),
            "No such file"
        );
    }

    #[test]
    fn keeps_distinct_server_detail() {
        assert_eq!(
            dedupe_status_text(StatusCode::Failure, "link failed"),
            "link failed"
        );
        // OS-style messages that merely start with the same words are
        // kept whole, not chopped mid-word.
        assert_eq!(
            dedupe_status_text(
                StatusCode::NoSuchFile,
                "No such file or directory (os error 2)",
            ),
            "No such file or directory (os error 2)"
        );
    }

    #[test]
    fn maps_missing_file_to_not_found_with_path() {
        let err = map_status_err(
            StatusCode::NoSuchFile,
            "No such file",
            "/home/user/.config/relix/projects.json",
        );
        assert!(matches!(err.code, SshErrorCode::NotFound));
        assert_eq!(
            err.message,
            "No such file: /home/user/.config/relix/projects.json"
        );
    }
}
