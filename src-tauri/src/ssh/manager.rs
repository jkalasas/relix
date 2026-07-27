use std::collections::HashMap;
use std::sync::Arc;

use russh::Disconnect;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use super::connection::{handle_is_closed, LiveConnection, SharedHandle};
use super::error::{SshError, SshErrorCode};
use super::forward::{abort_forward, LiveForward};
use super::shell::LiveShell;

pub type HostId = String;
pub type SessionId = String;
pub type ForwardId = String;

pub use super::connection::ConnectConfig;
pub use super::forward::{
    StartDynamicForwardConfig, StartLocalForwardConfig, StartRemoteForwardConfig,
};
pub use super::shell::OpenShellResult;

pub struct SshManager {
    pub(crate) inner: Arc<Mutex<SshManagerInner>>,
}

pub(crate) struct SshManagerInner {
    pub(crate) connections: HashMap<HostId, LiveConnection>,
    pub(crate) shells: HashMap<SessionId, LiveShell>,
    pub(crate) forwards: HashMap<ForwardId, LiveForward>,
    pub(crate) connect_generations: HashMap<HostId, u64>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SshManagerInner {
                connections: HashMap::new(),
                shells: HashMap::new(),
                forwards: HashMap::new(),
                connect_generations: HashMap::new(),
            })),
        }
    }

    pub async fn disconnect(&self, app: &AppHandle, host_id: &str) -> Result<(), SshError> {
        let (removed_shells, removed_forwards, removed_conn) = {
            let mut inner = self.inner.lock().await;
            let session_ids: Vec<SessionId> = inner
                .shells
                .iter()
                .filter(|(_, s)| s.host_id == host_id)
                .map(|(id, _)| id.clone())
                .collect();

            let mut shells = Vec::with_capacity(session_ids.len());
            for id in session_ids {
                if let Some(shell) = inner.shells.remove(&id) {
                    shells.push((id, shell));
                }
            }

            let forward_ids: Vec<ForwardId> = inner
                .forwards
                .iter()
                .filter(|(_, f)| f.host_id == host_id)
                .map(|(id, _)| id.clone())
                .collect();

            let mut forwards = Vec::with_capacity(forward_ids.len());
            for id in forward_ids {
                if let Some(forward) = inner.forwards.remove(&id) {
                    forwards.push((id, forward));
                }
            }

            let conn = inner.connections.remove(host_id);
            let entry = inner
                .connect_generations
                .entry(host_id.to_string())
                .or_insert(0);
            *entry = entry.wrapping_add(1);
            (shells, forwards, conn)
        };

        for (id, shell) in removed_shells {
            shell.abort.abort();
            {
                let ch = shell.channel.lock().await;
                let _ = ch.close().await;
            }
            let _ = app.emit(
                "ssh://shell-closed",
                serde_json::json!({
                    "sessionId": id,
                    "hostId": host_id,
                    "reason": "disconnect",
                }),
            );
        }

        for (id, forward) in removed_forwards {
            abort_forward(&forward).await;
            let _ = app.emit(
                "ssh://forward-closed",
                serde_json::json!({
                    "forwardId": id,
                    "hostId": host_id,
                    "reason": "disconnect",
                }),
            );
        }

        if let Some(conn) = removed_conn {
            conn.remote_routes.lock().await.clear();
            let handle = conn.handle.lock().await;
            let _ = handle
                .disconnect(Disconnect::ByApplication, "user disconnect", "")
                .await;
        }
        Ok(())
    }

    pub(crate) async fn take_live_handle(
        &self,
        host_id: &str,
        forward_id: &str,
    ) -> Result<(SharedHandle, super::connection::RemoteRoutes), SshError> {
        let mut inner = self.inner.lock().await;
        if inner.forwards.contains_key(forward_id) {
            return Err(SshError::new(
                SshErrorCode::ForwardFailed,
                "Tunnel is already active",
            ));
        }
        match inner.connections.get(host_id) {
            Some(conn) if !handle_is_closed(&conn.handle) => {
                Ok((Arc::clone(&conn.handle), Arc::clone(&conn.remote_routes)))
            }
            Some(_) => {
                inner.connections.remove(host_id);
                Err(SshError::new(
                    SshErrorCode::NotConnected,
                    "Host is not connected",
                ))
            }
            None => Err(SshError::new(
                SshErrorCode::NotConnected,
                "Host is not connected",
            )),
        }
    }

    pub(crate) async fn register_forward(
        &self,
        host_id: &str,
        forward_id: &str,
        handle: &SharedHandle,
        forward: LiveForward,
    ) -> bool {
        let mut inner = self.inner.lock().await;
        let still_valid = inner
            .connections
            .get(host_id)
            .map(|conn| Arc::ptr_eq(&conn.handle, handle) && !handle_is_closed(&conn.handle))
            .unwrap_or(false);

        if still_valid && !inner.forwards.contains_key(forward_id) {
            inner.forwards.insert(forward_id.to_string(), forward);
            true
        } else {
            false
        }
    }
}
