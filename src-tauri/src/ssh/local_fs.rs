use std::path::{Path, PathBuf};
use std::time::SystemTime;

use super::error::{SshError, SshErrorCode};
use super::local_shell::is_local_host_id;
use super::sftp::{
    SftpEntry, SftpListConfig, SftpListResult, SftpMkdirConfig, SftpReadConfig, SftpRemoveConfig,
    SftpRenameConfig, SftpWriteConfig,
};

const MAX_TRANSFER_BYTES: usize = 32 * 1024 * 1024;

fn map_io_err(err: impl std::fmt::Display) -> SshError {
    SshError::new(SshErrorCode::TransferFailed, err.to_string())
}

fn desktop_only() -> Result<(), SshError> {
    if cfg!(mobile) {
        return Err(SshError::new(
            SshErrorCode::Internal,
            "Local files are only available on desktop",
        ));
    }
    Ok(())
}

fn ensure_local_host(host_id: &str) -> Result<(), SshError> {
    if !is_local_host_id(host_id) {
        return Err(SshError::new(
            SshErrorCode::Internal,
            "Local filesystem ops require the local host",
        ));
    }
    desktop_only()
}

fn path_display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn resolve_path(requested: &str) -> Result<PathBuf, SshError> {
    let trimmed = requested.trim();
    let base = if trimmed.is_empty() || trimmed == "." {
        std::env::current_dir().map_err(map_io_err)?
    } else {
        PathBuf::from(trimmed)
    };

    if base.exists() {
        base.canonicalize().map_err(map_io_err)
    } else if let Some(parent) = base.parent().filter(|p| !p.as_os_str().is_empty()) {
        let parent = if parent.exists() {
            parent.canonicalize().map_err(map_io_err)?
        } else {
            parent.to_path_buf()
        };
        let name = base
            .file_name()
            .ok_or_else(|| SshError::new(SshErrorCode::TransferFailed, "Invalid path"))?;
        Ok(parent.join(name))
    } else {
        Ok(base)
    }
}

fn mtime_secs(meta: &std::fs::Metadata) -> Option<u32> {
    meta.modified().ok().and_then(|time| {
        time.duration_since(SystemTime::UNIX_EPOCH)
            .ok()
            .and_then(|d| u32::try_from(d.as_secs()).ok())
    })
}

pub async fn list(config: SftpListConfig) -> Result<SftpListResult, SshError> {
    ensure_local_host(&config.host_id)?;
    tokio::task::spawn_blocking(move || list_blocking(config))
        .await
        .map_err(|err| SshError::new(SshErrorCode::Internal, err.to_string()))?
}

fn list_blocking(config: SftpListConfig) -> Result<SftpListResult, SshError> {
    let path = resolve_path(&config.path)?;
    let meta = std::fs::metadata(&path).map_err(map_io_err)?;
    if !meta.is_dir() {
        return Err(SshError::new(
            SshErrorCode::TransferFailed,
            format!("Not a directory: {}", path_display(&path)),
        ));
    }

    let mut entries: Vec<SftpEntry> = std::fs::read_dir(&path)
        .map_err(map_io_err)?
        .filter_map(|item| item.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == "." || name == ".." {
                return None;
            }
            let entry_path = entry.path();
            let meta = entry.metadata().ok()?;
            Some(SftpEntry {
                name,
                path: path_display(&entry_path),
                is_dir: meta.is_dir(),
                size: meta.len(),
                mtime: mtime_secs(&meta),
            })
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(SftpListResult {
        path: path_display(&path),
        entries,
    })
}

pub async fn read(config: SftpReadConfig) -> Result<Vec<u8>, SshError> {
    ensure_local_host(&config.host_id)?;
    tokio::task::spawn_blocking(move || read_blocking(config))
        .await
        .map_err(|err| SshError::new(SshErrorCode::Internal, err.to_string()))?
}

fn read_blocking(config: SftpReadConfig) -> Result<Vec<u8>, SshError> {
    let path = resolve_path(&config.path)?;
    let meta = std::fs::metadata(&path).map_err(map_io_err)?;
    let size = meta.len() as usize;
    if size > MAX_TRANSFER_BYTES {
        return Err(SshError::new(
            SshErrorCode::TransferFailed,
            format!(
                "File is too large to open in-app ({} bytes; max {} bytes)",
                size, MAX_TRANSFER_BYTES
            ),
        ));
    }
    std::fs::read(&path).map_err(map_io_err)
}

pub async fn write(config: SftpWriteConfig) -> Result<(), SshError> {
    ensure_local_host(&config.host_id)?;
    if config.data.len() > MAX_TRANSFER_BYTES {
        return Err(SshError::new(
            SshErrorCode::TransferFailed,
            format!(
                "File is too large to write in-app ({} bytes; max {} bytes)",
                config.data.len(),
                MAX_TRANSFER_BYTES
            ),
        ));
    }
    tokio::task::spawn_blocking(move || write_blocking(config))
        .await
        .map_err(|err| SshError::new(SshErrorCode::Internal, err.to_string()))?
}

fn write_blocking(config: SftpWriteConfig) -> Result<(), SshError> {
    let path = resolve_path(&config.path)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(map_io_err)?;
        }
    }
    std::fs::write(&path, &config.data).map_err(map_io_err)
}

pub async fn mkdir(config: SftpMkdirConfig) -> Result<(), SshError> {
    ensure_local_host(&config.host_id)?;
    tokio::task::spawn_blocking(move || mkdir_blocking(config))
        .await
        .map_err(|err| SshError::new(SshErrorCode::Internal, err.to_string()))?
}

fn mkdir_blocking(config: SftpMkdirConfig) -> Result<(), SshError> {
    let path = resolve_path(&config.path)?;
    std::fs::create_dir(&path).map_err(map_io_err)
}

pub async fn remove(config: SftpRemoveConfig) -> Result<(), SshError> {
    ensure_local_host(&config.host_id)?;
    tokio::task::spawn_blocking(move || remove_blocking(config))
        .await
        .map_err(|err| SshError::new(SshErrorCode::Internal, err.to_string()))?
}

fn remove_blocking(config: SftpRemoveConfig) -> Result<(), SshError> {
    let path = resolve_path(&config.path)?;
    if config.is_dir {
        std::fs::remove_dir(&path).map_err(map_io_err)
    } else {
        std::fs::remove_file(&path).map_err(map_io_err)
    }
}

pub async fn rename(config: SftpRenameConfig) -> Result<(), SshError> {
    ensure_local_host(&config.host_id)?;
    tokio::task::spawn_blocking(move || rename_blocking(config))
        .await
        .map_err(|err| SshError::new(SshErrorCode::Internal, err.to_string()))?
}

fn rename_blocking(config: SftpRenameConfig) -> Result<(), SshError> {
    let from = resolve_path(&config.from)?;
    let to = resolve_path(&config.to)?;
    std::fs::rename(&from, &to).map_err(map_io_err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::local_shell::LOCAL_HOST_ID;

    #[test]
    fn rejects_non_local_host() {
        let err = ensure_local_host("remote").unwrap_err();
        assert!(matches!(err.code, SshErrorCode::Internal));
    }

    #[test]
    fn accepts_local_host_on_desktop() {
        if cfg!(mobile) {
            assert!(ensure_local_host(LOCAL_HOST_ID).is_err());
        } else {
            assert!(ensure_local_host(LOCAL_HOST_ID).is_ok());
        }
    }
}
