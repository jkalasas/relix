use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::error::{SshError, SshErrorCode};
use super::local_fs;
use super::local_shell::is_local_host_id;
use super::manager::SshManager;
use super::sftp;

const MAX_TRANSFER_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsListResult {
    pub path: String,
    pub entries: Vec<FsEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsListConfig {
    pub host_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsReadConfig {
    pub host_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsWriteConfig {
    pub host_id: String,
    pub path: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsMkdirConfig {
    pub host_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsRemoveConfig {
    pub host_id: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsRenameConfig {
    pub host_id: String,
    pub from: String,
    pub to: String,
}

impl SshManager {
    pub async fn fs_list(
        &self,
        _app: &AppHandle,
        config: FsListConfig,
    ) -> Result<FsListResult, SshError> {
        if is_local_host_id(&config.host_id) {
            return local_fs::list(config).await;
        }
        sftp::remote_list(self, config).await
    }

    pub async fn fs_read(
        &self,
        _app: &AppHandle,
        config: FsReadConfig,
    ) -> Result<Vec<u8>, SshError> {
        if is_local_host_id(&config.host_id) {
            return local_fs::read(config).await;
        }
        sftp::remote_read(self, config).await
    }

    pub async fn fs_write(
        &self,
        _app: &AppHandle,
        config: FsWriteConfig,
    ) -> Result<(), SshError> {
        if is_local_host_id(&config.host_id) {
            return local_fs::write(config).await;
        }
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
        sftp::remote_write(self, config).await
    }

    pub async fn fs_mkdir(
        &self,
        _app: &AppHandle,
        config: FsMkdirConfig,
    ) -> Result<(), SshError> {
        if is_local_host_id(&config.host_id) {
            return local_fs::mkdir(config).await;
        }
        sftp::remote_mkdir(self, config).await
    }

    pub async fn fs_remove(
        &self,
        _app: &AppHandle,
        config: FsRemoveConfig,
    ) -> Result<(), SshError> {
        if is_local_host_id(&config.host_id) {
            return local_fs::remove(config).await;
        }
        sftp::remote_remove(self, config).await
    }

    pub async fn fs_rename(
        &self,
        _app: &AppHandle,
        config: FsRenameConfig,
    ) -> Result<(), SshError> {
        if is_local_host_id(&config.host_id) {
            return local_fs::rename(config).await;
        }
        sftp::remote_rename(self, config).await
    }
}
