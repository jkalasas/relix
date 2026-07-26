use std::collections::HashMap;
use std::net::ToSocketAddrs;
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use russh::client::{self, Handle};
use russh::keys::{self, PrivateKeyWithHashAlg, PublicKeyBase64};
use russh::{ChannelMsg, ChannelWriteHalf, Disconnect};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::error::{SshError, SshErrorCode};
use super::known_hosts::{
    check_host_key, host_key_error, host_key_id, KnownHostEntry, KnownHosts, KNOWN_HOSTS_KEY,
    STORE_FILE,
};

pub type HostId = String;
pub type SessionId = String;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectConfig {
    pub host_id: String,
    pub user: String,
    pub hostname: String,
    pub port: u16,
    pub auth_method: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

impl std::fmt::Debug for ConnectConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConnectConfig")
            .field("host_id", &self.host_id)
            .field("user", &self.user)
            .field("hostname", &self.hostname)
            .field("port", &self.port)
            .field("auth_method", &self.auth_method)
            .field("password", &self.password.as_ref().map(|_| "***"))
            .field("private_key", &self.private_key.as_ref().map(|_| "***"))
            .field("private_key_path", &self.private_key_path)
            .field("passphrase", &self.passphrase.as_ref().map(|_| "***"))
            .finish()
    }
}

struct CapturedKey {
    algorithm: String,
    bytes: Vec<u8>,
}

struct ClientHandler {
    captured: Arc<Mutex<Option<CapturedKey>>>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let algorithm = server_public_key.algorithm().to_string();
        // Prefer russh's stable PublicKeyBase64 encoding for equality checks.
        let bytes = server_public_key.public_key_bytes();
        let mut guard = self.captured.lock().await;
        *guard = Some(CapturedKey { algorithm, bytes });
        Ok(true)
    }
}

struct LiveConnection {
    /// Shared so shell open can clone the Arc and drop the manager lock
    /// before awaiting channel setup (Handle itself is not Clone in russh 0.54).
    handle: Arc<Handle<ClientHandler>>,
}

struct LiveShell {
    host_id: HostId,
    /// Write half only; the read half is owned exclusively by the reader task so
    /// stdin/resize/close never contend with `wait()`.
    channel: Arc<Mutex<ChannelWriteHalf<client::Msg>>>,
    abort: tokio::task::AbortHandle,
}

pub struct SshManager {
    inner: Arc<Mutex<SshManagerInner>>,
}

struct SshManagerInner {
    connections: HashMap<HostId, LiveConnection>,
    shells: HashMap<SessionId, LiveShell>,
    /// Per-host generation used to cancel in-flight connects.
    /// Bumped on connect start and on disconnect; a connect may only insert
    /// if its captured generation still matches.
    connect_generations: HashMap<HostId, u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenShellResult {
    pub session_id: String,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SshManagerInner {
                connections: HashMap::new(),
                shells: HashMap::new(),
                connect_generations: HashMap::new(),
            })),
        }
    }

    pub async fn connect(&self, app: &AppHandle, config: ConnectConfig) -> Result<(), SshError> {
        // Under lock: return if already live; prune closed; claim a generation so
        // disconnect (or a newer connect) can cancel this attempt.
        let generation = {
            let mut inner = self.inner.lock().await;
            if let Some(existing) = inner.connections.get(&config.host_id) {
                if !existing.handle.is_closed() {
                    return Ok(());
                }
                inner.connections.remove(&config.host_id);
            }
            let entry = inner
                .connect_generations
                .entry(config.host_id.clone())
                .or_insert(0);
            *entry = entry.wrapping_add(1);
            *entry
        };

        let known = load_known_hosts(app)?;
        let captured = Arc::new(Mutex::new(None));
        let handler = ClientHandler {
            captured: Arc::clone(&captured),
        };

        let conf = client::Config {
            inactivity_timeout: None,
            keepalive_interval: Some(Duration::from_secs(30)),
            ..Default::default()
        };

        let addr = format!("{}:{}", config.hostname, config.port);
        let mut addrs = addr
            .to_socket_addrs()
            .map_err(|e| SshError::new(SshErrorCode::ConnectFailed, e.to_string()))?;
        let sock = addrs.next().ok_or_else(|| {
            SshError::new(
                SshErrorCode::ConnectFailed,
                format!("Could not resolve {}", config.hostname),
            )
        })?;

        const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
        let mut handle = tokio::time::timeout(
            CONNECT_TIMEOUT,
            client::connect(Arc::new(conf), sock, handler),
        )
        .await
        .map_err(|_| {
            SshError::new(
                SshErrorCode::ConnectFailed,
                format!("Connection to {addr} timed out after 30s"),
            )
        })?
        .map_err(|e| SshError::new(SshErrorCode::ConnectFailed, e.to_string()))?;

        let key = captured.lock().await.take().ok_or_else(|| {
            SshError::new(
                SshErrorCode::Internal,
                "Server host key was not presented",
            )
        })?;

        let check = check_host_key(
            &known,
            &config.hostname,
            config.port,
            &key.algorithm,
            &key.bytes,
        );
        if let Some(err) = host_key_error(
            check,
            &config.hostname,
            config.port,
            &key.algorithm,
            &key.bytes,
        ) {
            let _ = handle
                .disconnect(Disconnect::ByApplication, "host key not trusted", "")
                .await;
            return Err(err);
        }

        authenticate(&mut handle, &config).await?;

        // Only insert if our generation is still current. A disconnect (or a newer
        // connect for the same host) will have bumped it; discard this handle.
        // Also close the concurrent-connect race: only one live entry may win.
        {
            let mut inner = self.inner.lock().await;
            let current = inner.connect_generations.get(&config.host_id).copied();
            if current != Some(generation) {
                drop(inner);
                let _ = handle
                    .disconnect(Disconnect::ByApplication, "connect cancelled", "")
                    .await;
                return Ok(());
            }
            if let Some(existing) = inner.connections.get(&config.host_id) {
                if !existing.handle.is_closed() {
                    drop(inner);
                    let _ = handle
                        .disconnect(Disconnect::ByApplication, "duplicate connection", "")
                        .await;
                    return Ok(());
                }
                // Stale entry: replace below.
                inner.connections.remove(&config.host_id);
            }
            inner.connections.insert(
                config.host_id.clone(),
                LiveConnection {
                    handle: Arc::new(handle),
                },
            );
        }
        Ok(())
    }

    pub async fn disconnect(&self, app: &AppHandle, host_id: &str) -> Result<(), SshError> {
        // Remove shells/connection and invalidate in-flight connect generation under
        // the same lock so a slow connect cannot re-insert after we return.
        let (removed_shells, removed_conn) = {
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
            let conn = inner.connections.remove(host_id);
            // Bump generation so any in-flight connect for this host is cancelled.
            let entry = inner
                .connect_generations
                .entry(host_id.to_string())
                .or_insert(0);
            *entry = entry.wrapping_add(1);
            (shells, conn)
        };

        // Only emit for shells we successfully removed (single-owner emission).
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

        if let Some(conn) = removed_conn {
            let _ = conn
                .handle
                .disconnect(Disconnect::ByApplication, "user disconnect", "")
                .await;
        }
        Ok(())
    }

    pub async fn open_shell(
        &self,
        app: &AppHandle,
        host_id: String,
        cols: u32,
        rows: u32,
    ) -> Result<OpenShellResult, SshError> {
        // Clone the Arc so we can re-validate by pointer identity after the await
        // window (host_id alone is not enough: disconnect + reconnect can insert a
        // new handle under the same id).
        let handle = {
            let mut inner = self.inner.lock().await;
            match inner.connections.get(&host_id) {
                Some(conn) if !conn.handle.is_closed() => Arc::clone(&conn.handle),
                Some(_) => {
                    // Stale closed entry: prune and treat as not connected.
                    inner.connections.remove(&host_id);
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

        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
        channel
            .request_shell(true)
            .await
            .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

        let session_id = Uuid::new_v4().to_string();
        let app_handle = app.clone();
        let sid = session_id.clone();
        let hid = host_id.clone();

        // Split so the reader can wait without blocking write/resize/close.
        let (mut read_half, write_half) = channel.split();
        let channel_arc = Arc::new(Mutex::new(write_half));
        let shells_map = Arc::clone(&self.inner);
        let cleanup_sid = session_id.clone();

        // Gate the read loop until the shell is registered in the map so early EOF
        // cannot emit shell-closed / remove before the frontend has a sessionId.
        let (start_tx, start_rx) = tokio::sync::oneshot::channel::<()>();
        let join = tokio::spawn(async move {
            if start_rx.await.is_err() {
                // Open was aborted before registration completed.
                return;
            }
            loop {
                let msg = read_half.wait().await;
                match msg {
                    Some(ChannelMsg::Data { ref data }) => {
                        let encoded = B64.encode(data.as_ref());
                        let _ = app_handle.emit(
                            "ssh://data",
                            serde_json::json!({
                                "sessionId": sid,
                                "data": encoded,
                            }),
                        );
                    }
                    Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        let encoded = B64.encode(data.as_ref());
                        let _ = app_handle.emit(
                            "ssh://data",
                            serde_json::json!({
                                "sessionId": sid,
                                "data": encoded,
                            }),
                        );
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                        // Only the task that successfully removes emits shell-closed.
                        let removed = {
                            let mut inner = shells_map.lock().await;
                            inner.shells.remove(&cleanup_sid)
                        };
                        if removed.is_some() {
                            let _ = app_handle.emit(
                                "ssh://shell-closed",
                                serde_json::json!({
                                    "sessionId": sid,
                                    "hostId": hid,
                                    "reason": "eof",
                                }),
                            );
                        }
                        break;
                    }
                    _ => {}
                }
            }
        });

        // Re-validate by handle identity under lock, then register before starting
        // the reader so events cannot race ahead of map insertion.
        {
            let mut inner = self.inner.lock().await;
            let still_valid = inner
                .connections
                .get(&host_id)
                .map(|conn| Arc::ptr_eq(&conn.handle, &handle) && !conn.handle.is_closed())
                .unwrap_or(false);

            if !still_valid {
                join.abort();
                // Drop the gate so the reader exits if abort races with the await.
                drop(start_tx);
                {
                    let ch = channel_arc.lock().await;
                    let _ = ch.close().await;
                }
                return Err(SshError::new(
                    SshErrorCode::NotConnected,
                    "Host disconnected while opening shell",
                ));
            }

            inner.shells.insert(
                session_id.clone(),
                LiveShell {
                    host_id,
                    channel: Arc::clone(&channel_arc),
                    abort: join.abort_handle(),
                },
            );
        }

        // Registered: allow the reader to start consuming channel messages.
        let _ = start_tx.send(());

        Ok(OpenShellResult { session_id })
    }

    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), SshError> {
        let channel = {
            let inner = self.inner.lock().await;
            let shell = inner.shells.get(session_id).ok_or_else(|| {
                SshError::new(SshErrorCode::NotConnected, "Shell session not found")
            })?;
            Arc::clone(&shell.channel)
        };
        let ch = channel.lock().await;
        ch.data(data.as_bytes())
            .await
            .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), SshError> {
        let channel = {
            let inner = self.inner.lock().await;
            let shell = inner.shells.get(session_id).ok_or_else(|| {
                SshError::new(SshErrorCode::NotConnected, "Shell session not found")
            })?;
            Arc::clone(&shell.channel)
        };
        let ch = channel.lock().await;
        ch.window_change(cols, rows, 0, 0)
            .await
            .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
        Ok(())
    }

    pub async fn close_shell(&self, app: &AppHandle, session_id: &str) -> Result<(), SshError> {
        // Only the task that successfully removes emits shell-closed.
        let shell = {
            let mut inner = self.inner.lock().await;
            inner.shells.remove(session_id)
        };
        if let Some(shell) = shell {
            shell.abort.abort();
            let host_id = shell.host_id.clone();
            {
                let ch = shell.channel.lock().await;
                let _ = ch.close().await;
            }
            let _ = app.emit(
                "ssh://shell-closed",
                serde_json::json!({
                    "sessionId": session_id,
                    "hostId": host_id,
                    "reason": "closed",
                }),
            );
        }
        Ok(())
    }

    pub async fn trust_host_key(
        &self,
        app: &AppHandle,
        hostname: String,
        port: u16,
        algorithm: String,
        key_base64: String,
    ) -> Result<(), SshError> {
        let mut known = load_known_hosts(app)?;
        known.insert(
            host_key_id(&hostname, port),
            KnownHostEntry {
                algorithm,
                key_base64,
            },
        );
        save_known_hosts(app, &known)
    }
}

async fn authenticate(
    handle: &mut Handle<ClientHandler>,
    config: &ConnectConfig,
) -> Result<(), SshError> {
    let user = config.user.clone();
    match config.auth_method.as_str() {
        "password" => {
            let password = config.password.clone().ok_or_else(|| {
                SshError::new(SshErrorCode::AuthFailed, "Password is required")
            })?;
            let res = handle
                .authenticate_password(user, password)
                .await
                .map_err(|e| SshError::new(SshErrorCode::AuthFailed, e.to_string()))?;
            if !res.success() {
                return Err(SshError::new(
                    SshErrorCode::AuthFailed,
                    "Authentication failed",
                ));
            }
            Ok(())
        }
        "private_key" => {
            let key = load_private_key(config)?;
            let hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| SshError::new(SshErrorCode::AuthFailed, e.to_string()))?
                .flatten();
            let res = handle
                .authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                .await
                .map_err(|e| SshError::new(SshErrorCode::AuthFailed, e.to_string()))?;
            if !res.success() {
                return Err(SshError::new(
                    SshErrorCode::AuthFailed,
                    "Authentication failed",
                ));
            }
            Ok(())
        }
        other => Err(SshError::new(
            SshErrorCode::InvalidKey,
            format!("Unknown auth method: {other}"),
        )),
    }
}

fn load_private_key(config: &ConnectConfig) -> Result<russh::keys::PrivateKey, SshError> {
    let passphrase = config.passphrase.as_deref();
    if let Some(body) = config
        .private_key
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        return keys::decode_secret_key(body, passphrase).map_err(|e| {
            SshError::new(SshErrorCode::InvalidKey, e.to_string())
        });
    }
    if let Some(path) = config
        .private_key_path
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        return keys::load_secret_key(path, passphrase).map_err(|e| {
            let msg = e.to_string();
            if msg.contains("No such file") || msg.contains("not found") {
                SshError::new(
                    SshErrorCode::KeyUnreadable,
                    format!("Could not read key at {path}"),
                )
            } else {
                SshError::new(SshErrorCode::InvalidKey, msg)
            }
        });
    }
    Err(SshError::new(
        SshErrorCode::InvalidKey,
        "Private key body or path is required",
    ))
}

fn load_known_hosts(app: &AppHandle) -> Result<KnownHosts, SshError> {
    use tauri_plugin_store::StoreExt;
    let store = app
        .store(STORE_FILE)
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
    let value = store.get(KNOWN_HOSTS_KEY);
    match value {
        None => Ok(KnownHosts::new()),
        Some(v) => serde_json::from_value(v.clone()).map_err(|e| {
            SshError::new(SshErrorCode::Internal, e.to_string())
        }),
    }
}

fn save_known_hosts(app: &AppHandle, known: &KnownHosts) -> Result<(), SshError> {
    use tauri_plugin_store::StoreExt;
    let store = app
        .store(STORE_FILE)
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
    let value = serde_json::to_value(known)
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
    store.set(KNOWN_HOSTS_KEY.to_string(), value);
    store
        .save()
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
    Ok(())
}
