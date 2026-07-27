use std::collections::HashMap;
use std::net::ToSocketAddrs;
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use russh::client::{self, Handle, Msg};
use russh::keys::{self, PrivateKeyWithHashAlg, PublicKeyBase64};
use russh::{Channel, ChannelMsg, ChannelWriteHalf, Disconnect};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::error::{SshError, SshErrorCode};
use super::known_hosts::{
    check_host_key, host_key_error, host_key_id, KnownHostEntry, KnownHosts, KNOWN_HOSTS_KEY,
    STORE_FILE,
};
use super::socks::{accept_socks5_connect, reply_failure, reply_success};

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

#[derive(Clone)]
struct RemoteRoute {
    forward_id: String,
    host_id: String,
    local_host: String,
    local_port: u16,
    children: Arc<Mutex<Vec<tokio::task::AbortHandle>>>,
    app: AppHandle,
}

type RemoteRoutes = Arc<Mutex<HashMap<(String, u32), RemoteRoute>>>;
type SharedHandle = Arc<Mutex<Handle<ClientHandler>>>;

struct ClientHandler {
    captured: Arc<Mutex<Option<CapturedKey>>>,
    remote_routes: RemoteRoutes,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let algorithm = server_public_key.algorithm().to_string();
        let bytes = server_public_key.public_key_bytes();
        let mut guard = self.captured.lock().await;
        *guard = Some(CapturedKey { algorithm, bytes });
        Ok(true)
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let key = (connected_address.to_string(), connected_port);
        let route = {
            let routes = self.remote_routes.lock().await;
            routes.get(&key).cloned()
        };

        let Some(route) = route else {
            eprintln!(
                "relix: no remote forward for {connected_address}:{connected_port}"
            );
            return Ok(());
        };

        let target = format!("{}:{}", route.local_host, route.local_port);
        let children = Arc::clone(&route.children);
        let app = route.app.clone();
        let forward_id = route.forward_id.clone();
        let host_id = route.host_id.clone();

        let child = tokio::spawn(async move {
            match TcpStream::connect(&target).await {
                Ok(stream) => {
                    if let Err(err) = stream.set_nodelay(true) {
                        eprintln!("relix: set_nodelay failed: {err}");
                    }
                    relay_tcp_channel(stream, channel).await;
                }
                Err(err) => {
                    let message = format!(
                        "Nothing listening on local target {target} ({err}). Remote (R) forwards to a service on this machine — start it, or use Local (L) if the service is on the SSH host",
                    );
                    eprintln!("relix: {message}");
                    let _ = app.emit(
                        "ssh://forward-error",
                        serde_json::json!({
                            "forwardId": forward_id,
                            "hostId": host_id,
                            "message": message,
                        }),
                    );
                    drop(channel);
                }
            }
        });
        children.lock().await.push(child.abort_handle());
        Ok(())
    }
}

struct LiveConnection {
    handle: SharedHandle,
    remote_routes: RemoteRoutes,
}

struct LiveShell {
    host_id: HostId,
    channel: Arc<Mutex<ChannelWriteHalf<client::Msg>>>,
    abort: tokio::task::AbortHandle,
}

pub type ForwardId = String;

enum LiveForwardKind {
    Local,
    Remote { bind_host: String, bind_port: u32 },
    Dynamic,
}

struct LiveForward {
    host_id: HostId,
    kind: LiveForwardKind,
    abort: Option<tokio::task::AbortHandle>,
    children: Arc<Mutex<Vec<tokio::task::AbortHandle>>>,
    handle: Option<SharedHandle>,
    remote_routes: Option<RemoteRoutes>,
}

pub struct SshManager {
    inner: Arc<Mutex<SshManagerInner>>,
}

struct SshManagerInner {
    connections: HashMap<HostId, LiveConnection>,
    shells: HashMap<SessionId, LiveShell>,
    forwards: HashMap<ForwardId, LiveForward>,
    connect_generations: HashMap<HostId, u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenShellResult {
    pub session_id: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLocalForwardConfig {
    pub host_id: String,
    pub forward_id: String,
    pub local_host: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRemoteForwardConfig {
    pub host_id: String,
    pub forward_id: String,
    pub local_host: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDynamicForwardConfig {
    pub host_id: String,
    pub forward_id: String,
    pub local_host: String,
    pub local_port: u16,
}

fn handle_is_closed(handle: &Mutex<Handle<ClientHandler>>) -> bool {
    handle
        .try_lock()
        .map(|h| h.is_closed())
        .unwrap_or(false)
}

fn sh_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

/// OpenSSH runs exec via the user's login shell as `shell -c <command>`.
/// That shell may be fish/zsh/bash, so command scripts must not assume bash
/// syntax. Wrap portable work in `bash -lc` (bash is available on typical hosts).
fn bash_login(script: &str) -> String {
    format!("bash -lc {}", sh_single_quote(script))
}

enum ShellRemote {
    /// User's real login shell — preserves fish/zsh/bash config and OSC 7.
    RequestShell,
    Exec(String),
}

fn build_shell_remote(command: Option<String>, cwd: Option<String>) -> ShellRemote {
    let cwd = cwd.filter(|value| !value.is_empty());
    let command = command.filter(|value| !value.is_empty());

    match (command, cwd.as_deref()) {
        (Some(cmd), Some(path)) => {
            let script = format!("cd {} && exec {}", sh_single_quote(path), cmd);
            ShellRemote::Exec(bash_login(&script))
        }
        (Some(cmd), None) => ShellRemote::Exec(cmd),
        (None, Some(path)) => {
            // Start the user's shell in the active tab's directory.
            let script = format!(
                "cd {} && exec \"${{SHELL:-/bin/bash}}\" -il",
                sh_single_quote(path),
            );
            ShellRemote::Exec(bash_login(&script))
        }
        // No cwd: real login shell. Fish/zsh/bash already emit OSC 7 here.
        (None, None) => ShellRemote::RequestShell,
    }
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

    pub async fn connect(&self, app: &AppHandle, config: ConnectConfig) -> Result<(), SshError> {
        let generation = {
            let mut inner = self.inner.lock().await;
            if let Some(existing) = inner.connections.get(&config.host_id) {
                if !handle_is_closed(&existing.handle) {
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
        let remote_routes: RemoteRoutes = Arc::new(Mutex::new(HashMap::new()));
        let handler = ClientHandler {
            captured: Arc::clone(&captured),
            remote_routes: Arc::clone(&remote_routes),
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
                if !handle_is_closed(&existing.handle) {
                    drop(inner);
                    let _ = handle
                        .disconnect(Disconnect::ByApplication, "duplicate connection", "")
                        .await;
                    return Ok(());
                }
                inner.connections.remove(&config.host_id);
            }
            inner.connections.insert(
                config.host_id.clone(),
                LiveConnection {
                    handle: Arc::new(Mutex::new(handle)),
                    remote_routes,
                },
            );
        }
        Ok(())
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

    pub async fn open_shell(
        &self,
        app: &AppHandle,
        host_id: String,
        cols: u32,
        rows: u32,
        command: Option<String>,
        cwd: Option<String>,
    ) -> Result<OpenShellResult, SshError> {
        let handle = {
            let mut inner = self.inner.lock().await;
            match inner.connections.get(&host_id) {
                Some(conn) if !handle_is_closed(&conn.handle) => Arc::clone(&conn.handle),
                Some(_) => {
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

        let channel = {
            let guard = handle.lock().await;
            guard
                .channel_open_session()
                .await
                .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?
        };

        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

        match build_shell_remote(command, cwd) {
            ShellRemote::RequestShell => {
                channel
                    .request_shell(true)
                    .await
                    .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
            }
            ShellRemote::Exec(remote) => {
                channel
                    .exec(true, remote)
                    .await
                    .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
            }
        }

        let session_id = Uuid::new_v4().to_string();
        let app_handle = app.clone();
        let sid = session_id.clone();
        let hid = host_id.clone();

        let (mut read_half, write_half) = channel.split();
        let channel_arc = Arc::new(Mutex::new(write_half));
        let shells_map = Arc::clone(&self.inner);
        let cleanup_sid = session_id.clone();

        let (start_tx, start_rx) = tokio::sync::oneshot::channel::<()>();
        let join = tokio::spawn(async move {
            if start_rx.await.is_err() {
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

        let registered = {
            let mut inner = self.inner.lock().await;
            let still_valid = inner
                .connections
                .get(&host_id)
                .map(|conn| {
                    Arc::ptr_eq(&conn.handle, &handle) && !handle_is_closed(&conn.handle)
                })
                .unwrap_or(false);

            if still_valid {
                inner.shells.insert(
                    session_id.clone(),
                    LiveShell {
                        host_id,
                        channel: Arc::clone(&channel_arc),
                        abort: join.abort_handle(),
                    },
                );
                true
            } else {
                false
            }
        };

        if !registered {
            join.abort();
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

    async fn take_live_handle(
        &self,
        host_id: &str,
        forward_id: &str,
    ) -> Result<(SharedHandle, RemoteRoutes), SshError> {
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

    pub async fn start_local_forward(
        &self,
        app: &AppHandle,
        config: StartLocalForwardConfig,
    ) -> Result<(), SshError> {
        let (handle, _) = self
            .take_live_handle(&config.host_id, &config.forward_id)
            .await?;

        let bind_addr = format!("{}:{}", config.local_host, config.local_port);
        let listener = TcpListener::bind(&bind_addr).await.map_err(|e| {
            SshError::new(
                SshErrorCode::BindFailed,
                format!("Could not bind {bind_addr}: {e}"),
            )
        })?;

        let children = Arc::new(Mutex::new(Vec::new()));
        let children_for_task = Arc::clone(&children);
        let host_id = config.host_id.clone();
        let forward_id = config.forward_id.clone();
        let remote_host = config.remote_host.clone();
        let remote_port = u32::from(config.remote_port);
        let app_handle = app.clone();
        let manager = Arc::clone(&self.inner);
        let handle_for_task = Arc::clone(&handle);

        let join = tokio::spawn(async move {
            loop {
                let accepted = listener.accept().await;
                let (mut stream, originator) = match accepted {
                    Ok(pair) => pair,
                    Err(_) => break,
                };

                if let Err(err) = stream.set_nodelay(true) {
                    eprintln!("relix: set_nodelay failed: {err}");
                }

                let originator_ip = originator_ip_string(originator);

                let channel = {
                    let guard = handle_for_task.lock().await;
                    guard
                        .channel_open_direct_tcpip(
                            remote_host.clone(),
                            remote_port,
                            originator_ip,
                            u32::from(originator.port()),
                        )
                        .await
                };

                let channel = match channel {
                    Ok(channel) => channel,
                    Err(err) => {
                        let message =
                            forward_open_error_message(&remote_host, remote_port, &err);
                        eprintln!("relix: {message}");
                        let _ = app_handle.emit(
                            "ssh://forward-error",
                            serde_json::json!({
                                "forwardId": forward_id,
                                "hostId": host_id,
                                "message": message,
                            }),
                        );
                        let _ = stream.shutdown().await;
                        continue;
                    }
                };

                let child = tokio::spawn(async move {
                    relay_tcp_channel(stream, channel).await;
                });
                children_for_task.lock().await.push(child.abort_handle());
            }

            let removed = {
                let mut inner = manager.lock().await;
                inner.forwards.remove(&forward_id)
            };
            if removed.is_some() {
                let _ = app_handle.emit(
                    "ssh://forward-closed",
                    serde_json::json!({
                        "forwardId": forward_id,
                        "hostId": host_id,
                        "reason": "listener_closed",
                    }),
                );
            }
        });

        if !self
            .register_forward(
                &config.host_id,
                &config.forward_id,
                &handle,
                LiveForward {
                    host_id: config.host_id.clone(),
                    kind: LiveForwardKind::Local,
                    abort: Some(join.abort_handle()),
                    children,
                    handle: None,
                    remote_routes: None,
                },
            )
            .await
        {
            join.abort();
            return Err(SshError::new(
                SshErrorCode::NotConnected,
                "Host disconnected while starting tunnel",
            ));
        }

        Ok(())
    }

    pub async fn start_remote_forward(
        &self,
        app: &AppHandle,
        config: StartRemoteForwardConfig,
    ) -> Result<(), SshError> {
        let (handle, remote_routes) = self
            .take_live_handle(&config.host_id, &config.forward_id)
            .await?;

        let bind_host = config.remote_host.clone();
        let bind_port = u32::from(config.remote_port);
        let children = Arc::new(Mutex::new(Vec::new()));
        let route_key = (bind_host.clone(), bind_port);

        {
            let mut routes = remote_routes.lock().await;
            if routes.contains_key(&route_key) {
                return Err(SshError::new(
                    SshErrorCode::ForwardFailed,
                    format!("Remote listen {bind_host}:{bind_port} is already in use"),
                ));
            }
            routes.insert(
                route_key.clone(),
                RemoteRoute {
                    forward_id: config.forward_id.clone(),
                    host_id: config.host_id.clone(),
                    local_host: config.local_host.clone(),
                    local_port: config.local_port,
                    children: Arc::clone(&children),
                    app: app.clone(),
                },
            );
        }

        let request = {
            let mut guard = handle.lock().await;
            // tcpip_forward requires &mut self on russh 0.54
            guard.tcpip_forward(bind_host.clone(), bind_port).await
        };

        if let Err(err) = request {
            remote_routes.lock().await.remove(&route_key);
            return Err(SshError::new(
                SshErrorCode::ForwardFailed,
                format!(
                    "SSH server refused remote listen on {bind_host}:{bind_port} ({err}). Check AllowTcpForwarding / GatewayPorts"
                ),
            ));
        }

        if !self
            .register_forward(
                &config.host_id,
                &config.forward_id,
                &handle,
                LiveForward {
                    host_id: config.host_id.clone(),
                    kind: LiveForwardKind::Remote {
                        bind_host,
                        bind_port,
                    },
                    abort: None,
                    children,
                    handle: Some(Arc::clone(&handle)),
                    remote_routes: Some(Arc::clone(&remote_routes)),
                },
            )
            .await
        {
            let _ = {
                let guard = handle.lock().await;
                guard
                    .cancel_tcpip_forward(route_key.0.clone(), route_key.1)
                    .await
            };
            remote_routes.lock().await.remove(&route_key);
            return Err(SshError::new(
                SshErrorCode::NotConnected,
                "Host disconnected while starting tunnel",
            ));
        }

        Ok(())
    }

    pub async fn start_dynamic_forward(
        &self,
        app: &AppHandle,
        config: StartDynamicForwardConfig,
    ) -> Result<(), SshError> {
        let (handle, _) = self
            .take_live_handle(&config.host_id, &config.forward_id)
            .await?;

        let bind_addr = format!("{}:{}", config.local_host, config.local_port);
        let listener = TcpListener::bind(&bind_addr).await.map_err(|e| {
            SshError::new(
                SshErrorCode::BindFailed,
                format!("Could not bind {bind_addr}: {e}"),
            )
        })?;

        let children = Arc::new(Mutex::new(Vec::new()));
        let children_for_task = Arc::clone(&children);
        let host_id = config.host_id.clone();
        let forward_id = config.forward_id.clone();
        let app_handle = app.clone();
        let manager = Arc::clone(&self.inner);
        let handle_for_task = Arc::clone(&handle);

        let join = tokio::spawn(async move {
            loop {
                let accepted = listener.accept().await;
                let (mut stream, originator) = match accepted {
                    Ok(pair) => pair,
                    Err(_) => break,
                };

                if let Err(err) = stream.set_nodelay(true) {
                    eprintln!("relix: set_nodelay failed: {err}");
                }

                let handle_for_child = Arc::clone(&handle_for_task);
                let app_for_child = app_handle.clone();
                let forward_id_for_child = forward_id.clone();
                let host_id_for_child = host_id.clone();
                let children_for_child = Arc::clone(&children_for_task);

                let child = tokio::spawn(async move {
                    let dest = match accept_socks5_connect(&mut stream).await {
                        Ok(dest) => dest,
                        Err(err) => {
                            eprintln!("relix: SOCKS handshake failed: {err}");
                            let _ = stream.shutdown().await;
                            return;
                        }
                    };

                    let originator_ip = originator_ip_string(originator);
                    let channel = {
                        let guard = handle_for_child.lock().await;
                        guard
                            .channel_open_direct_tcpip(
                                dest.host.clone(),
                                u32::from(dest.port),
                                originator_ip,
                                u32::from(originator.port()),
                            )
                            .await
                    };

                    let channel = match channel {
                        Ok(channel) => channel,
                        Err(err) => {
                            let message = forward_open_error_message(
                                &dest.host,
                                u32::from(dest.port),
                                &err,
                            );
                            eprintln!("relix: {message}");
                            let _ = reply_failure(&mut stream, 0x05).await;
                            let _ = app_for_child.emit(
                                "ssh://forward-error",
                                serde_json::json!({
                                    "forwardId": forward_id_for_child,
                                    "hostId": host_id_for_child,
                                    "message": message,
                                }),
                            );
                            let _ = stream.shutdown().await;
                            return;
                        }
                    };

                    if let Err(err) = reply_success(&mut stream).await {
                        eprintln!("relix: {err}");
                        let _ = stream.shutdown().await;
                        return;
                    }

                    relay_tcp_channel(stream, channel).await;
                });
                children_for_child.lock().await.push(child.abort_handle());
            }

            let removed = {
                let mut inner = manager.lock().await;
                inner.forwards.remove(&forward_id)
            };
            if removed.is_some() {
                let _ = app_handle.emit(
                    "ssh://forward-closed",
                    serde_json::json!({
                        "forwardId": forward_id,
                        "hostId": host_id,
                        "reason": "listener_closed",
                    }),
                );
            }
        });

        if !self
            .register_forward(
                &config.host_id,
                &config.forward_id,
                &handle,
                LiveForward {
                    host_id: config.host_id.clone(),
                    kind: LiveForwardKind::Dynamic,
                    abort: Some(join.abort_handle()),
                    children,
                    handle: None,
                    remote_routes: None,
                },
            )
            .await
        {
            join.abort();
            return Err(SshError::new(
                SshErrorCode::NotConnected,
                "Host disconnected while starting tunnel",
            ));
        }

        Ok(())
    }

    async fn register_forward(
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

    pub async fn stop_forward(
        &self,
        app: &AppHandle,
        forward_id: &str,
    ) -> Result<(), SshError> {
        let forward = {
            let mut inner = self.inner.lock().await;
            inner.forwards.remove(forward_id)
        };

        let Some(forward) = forward else {
            return Err(SshError::new(
                SshErrorCode::NotFound,
                "Tunnel is not active",
            ));
        };

        let host_id = forward.host_id.clone();
        abort_forward(&forward).await;
        let _ = app.emit(
            "ssh://forward-closed",
            serde_json::json!({
                "forwardId": forward_id,
                "hostId": host_id,
                "reason": "stopped",
            }),
        );
        Ok(())
    }
}

async fn abort_forward(forward: &LiveForward) {
    if let Some(abort) = &forward.abort {
        abort.abort();
    }

    if let LiveForwardKind::Remote {
        bind_host,
        bind_port,
    } = &forward.kind
    {
        if let Some(routes) = &forward.remote_routes {
            routes
                .lock()
                .await
                .remove(&(bind_host.clone(), *bind_port));
        }
        if let Some(handle) = &forward.handle {
            let guard = handle.lock().await;
            let _ = guard
                .cancel_tcpip_forward(bind_host.clone(), *bind_port)
                .await;
        }
    }

    let children = {
        let mut guard = forward.children.lock().await;
        std::mem::take(&mut *guard)
    };
    for child in children {
        child.abort();
    }
}

async fn relay_tcp_channel(mut stream: TcpStream, channel: Channel<client::Msg>) {
    let mut chan_stream = channel.into_stream();
    match tokio::io::copy_bidirectional(&mut stream, &mut chan_stream).await {
        Ok(_) => {}
        Err(err) => {
            eprintln!("relix: forward relay ended: {err}");
        }
    }
    let _ = stream.shutdown().await;
}

fn originator_ip_string(originator: std::net::SocketAddr) -> String {
    match originator {
        std::net::SocketAddr::V4(v4) => v4.ip().to_string(),
        std::net::SocketAddr::V6(v6) => {
            if let Some(v4) = v6.ip().to_ipv4_mapped() {
                v4.to_string()
            } else {
                "127.0.0.1".to_string()
            }
        }
    }
}

fn forward_open_error_message(remote_host: &str, remote_port: u32, err: &russh::Error) -> String {
    let target = format!("{remote_host}:{remote_port}");
    match err {
        russh::Error::ChannelOpenFailure(russh::ChannelOpenFailure::ConnectFailed) => {
            format!(
                "Remote {target} refused the connection (nothing listening there on the SSH host, or wrong host/port)"
            )
        }
        russh::Error::ChannelOpenFailure(
            russh::ChannelOpenFailure::AdministrativelyProhibited,
        ) => {
            format!(
                "SSH server blocked the tunnel to {target} (AllowTcpForwarding / PermitOpen)"
            )
        }
        other => format!("Could not open tunnel to {target}: {other}"),
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

#[cfg(test)]
mod tests {
    use super::{bash_login, build_shell_remote, sh_single_quote, ShellRemote};

    #[test]
    fn quotes_paths_for_posix_shells() {
        assert_eq!(sh_single_quote("/tmp/work"), "'/tmp/work'");
        assert_eq!(sh_single_quote("a'b"), "'a'\"'\"'b'");
    }

    #[test]
    fn wraps_command_with_cwd_via_bash() {
        let remote = build_shell_remote(
            Some("pi".into()),
            Some("/home/u/proj".into()),
        );
        match remote {
            ShellRemote::Exec(cmd) => {
                assert_eq!(
                    cmd,
                    bash_login("cd '/home/u/proj' && exec pi"),
                );
                // Must survive fish -c (user login shell on this machine).
                assert!(cmd.starts_with("bash -lc "));
            }
            ShellRemote::RequestShell => panic!("expected exec"),
        }
    }

    #[test]
    fn leaves_command_alone_without_cwd() {
        match build_shell_remote(Some("claude".into()), None) {
            ShellRemote::Exec(cmd) => assert_eq!(cmd, "claude"),
            ShellRemote::RequestShell => panic!("expected exec"),
        }
    }

    #[test]
    fn interactive_without_cwd_uses_real_login_shell() {
        match build_shell_remote(None, None) {
            ShellRemote::RequestShell => {}
            ShellRemote::Exec(cmd) => panic!("expected request_shell, got {cmd}"),
        }
    }

    #[test]
    fn interactive_with_cwd_starts_user_shell_there() {
        match build_shell_remote(None, Some("/home/u/proj".into())) {
            ShellRemote::Exec(cmd) => {
                assert!(cmd.starts_with("bash -lc "));
                assert!(cmd.contains("/home/u/proj"));
                assert!(cmd.contains("${SHELL:-/bin/bash}"));
                assert_eq!(
                    cmd,
                    bash_login("cd '/home/u/proj' && exec \"${SHELL:-/bin/bash}\" -il"),
                );
            }
            ShellRemote::RequestShell => panic!("expected exec with cd"),
        }
    }

    #[test]
    fn bash_login_survives_fish_c() {
        let cmd = bash_login("cd '/tmp' && pwd");
        let output = std::process::Command::new("fish")
            .args(["-c", &cmd])
            .output()
            .expect("fish");
        assert!(output.status.success(), "stderr={}", String::from_utf8_lossy(&output.stderr));
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "/tmp");
    }

    #[test]
    fn bash_login_pi_cwd_survives_fish_c() {
        let cmd = bash_login("cd '/home/jkalasas/Projects/personal/relix' && pwd && command -v pi");
        let output = std::process::Command::new("fish")
            .args(["-c", &cmd])
            .output()
            .expect("fish");
        assert!(output.status.success(), "stderr={}", String::from_utf8_lossy(&output.stderr));
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("/home/jkalasas/Projects/personal/relix"));
        assert!(stdout.contains("pi"));
    }
}
