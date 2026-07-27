use std::collections::HashMap;
use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::time::Duration;

use russh::client::{self, Handle, Msg};
use russh::keys::{self, PrivateKeyWithHashAlg, PublicKeyBase64};
use russh::{Channel, Disconnect};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use super::error::{SshError, SshErrorCode};
use super::known_hosts::{
    check_host_key, host_key_error, host_key_id, KnownHostEntry, KnownHosts, KNOWN_HOSTS_KEY,
    STORE_FILE,
};
use super::manager::SshManager;

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
pub(crate) struct RemoteRoute {
    pub(crate) forward_id: String,
    pub(crate) host_id: String,
    pub(crate) local_host: String,
    pub(crate) local_port: u16,
    pub(crate) children: Arc<Mutex<Vec<tokio::task::AbortHandle>>>,
    pub(crate) app: AppHandle,
}

pub(crate) type RemoteRoutes = Arc<Mutex<HashMap<(String, u32), RemoteRoute>>>;
pub(crate) type SharedHandle = Arc<Mutex<Handle<ClientHandler>>>;

#[derive(Clone)]
pub(crate) struct ClientHandler {
    captured: Arc<Mutex<Option<CapturedKey>>>,
    remote_routes: RemoteRoutes,
    app: AppHandle,
    host_id: String,
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const AUTH_TIMEOUT: Duration = Duration::from_secs(30);
const AUTH_CHECK_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const RESOLVE_TIMEOUT: Duration = Duration::from_secs(8);

fn extract_tailscale_check_url(text: &str) -> Option<String> {
    const MARKER: &str = "https://login.tailscale.com/a/";
    let idx = text.find(MARKER)?;
    let after = &text[idx + MARKER.len()..];
    let token_len = after
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric())
        .count();
    if token_len == 0 {
        return None;
    }
    Some(format!("{MARKER}{}", &after[..token_len]))
}

fn emit_auth_banner(app: &AppHandle, host_id: &str, banner: &str) {
    let check_url = extract_tailscale_check_url(banner);
    let _ = app.emit(
        "ssh://auth-banner",
        serde_json::json!({
            "hostId": host_id,
            "message": banner,
            "checkUrl": check_url,
        }),
    );
}

async fn resolve_connect_addrs(
    addr: &str,
    hostname: &str,
) -> Result<Vec<SocketAddr>, SshError> {
    let resolved = tokio::time::timeout(RESOLVE_TIMEOUT, tokio::net::lookup_host(addr.to_string()))
        .await
        .map_err(|_| {
            SshError::new(
                SshErrorCode::ConnectFailed,
                format!("Timed out resolving {hostname}"),
            )
        })?
        .map_err(|e| SshError::new(SshErrorCode::ConnectFailed, e.to_string()))?;

    let mut socks: Vec<SocketAddr> = resolved.collect();
    if socks.is_empty() {
        // Blocking fallback for platforms where lookup_host is incomplete.
        socks = addr
            .to_socket_addrs()
            .map_err(|e| SshError::new(SshErrorCode::ConnectFailed, e.to_string()))?
            .collect();
    }
    if socks.is_empty() {
        return Err(SshError::new(
            SshErrorCode::ConnectFailed,
            format!("Could not resolve {hostname}"),
        ));
    }

    socks.sort_by_key(|sock| !sock.is_ipv4());
    Ok(socks)
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn auth_banner(
        &mut self,
        banner: &str,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        emit_auth_banner(&self.app, &self.host_id, banner);
        Ok(())
    }

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

pub(crate) struct LiveConnection {
    pub(crate) handle: SharedHandle,
    pub(crate) remote_routes: RemoteRoutes,
}

pub(crate) fn handle_is_closed(handle: &Mutex<Handle<ClientHandler>>) -> bool {
    handle
        .try_lock()
        .map(|h| h.is_closed())
        .unwrap_or(false)
}

pub(crate) async fn relay_tcp_channel(mut stream: TcpStream, channel: Channel<client::Msg>) {
    let mut chan_stream = channel.into_stream();
    match tokio::io::copy_bidirectional(&mut stream, &mut chan_stream).await {
        Ok(_) => {}
        Err(err) => {
            eprintln!("relix: forward relay ended: {err}");
        }
    }
    let _ = stream.shutdown().await;
}

async fn auth_with_timeout<T, E, F>(
    timeout: Duration,
    cancel: &mut tokio::sync::oneshot::Receiver<()>,
    fut: F,
) -> Result<T, SshError>
where
    E: std::fmt::Display,
    F: std::future::Future<Output = Result<T, E>>,
{
    tokio::select! {
        _ = &mut *cancel => Err(SshError::new(
            SshErrorCode::AuthFailed,
            "Authentication cancelled",
        )),
        result = tokio::time::timeout(timeout, fut) => {
            match result {
                Ok(Ok(value)) => Ok(value),
                Ok(Err(err)) => Err(SshError::new(
                    SshErrorCode::AuthFailed,
                    err.to_string(),
                )),
                Err(_) => Err(SshError::new(
                    SshErrorCode::AuthFailed,
                    "Authentication timed out waiting for approval",
                )),
            }
        }
    }
}

pub(crate) async fn authenticate(
    handle: &mut Handle<ClientHandler>,
    app: &AppHandle,
    config: &ConnectConfig,
    cancel: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<(), SshError> {
    use russh::client::KeyboardInteractiveAuthResponse;

    let user = config.user.clone();

    // Tailscale SSH authenticates via method "none" + auth banners / check URL.
    let none = auth_with_timeout(
        AUTH_CHECK_TIMEOUT,
        cancel,
        handle.authenticate_none(user.clone()),
    )
    .await;
    match none {
        Ok(res) if res.success() => return Ok(()),
        Ok(_) => {}
        Err(err) if err.message == "Authentication cancelled" => return Err(err),
        Err(err) if err.message.contains("timed out") => return Err(err),
        Err(_) => {}
    }

    match config.auth_method.as_str() {
        "password" => {
            let password = config.password.clone().ok_or_else(|| {
                SshError::new(SshErrorCode::AuthFailed, "Password is required")
            })?;
            let res = auth_with_timeout(
                AUTH_CHECK_TIMEOUT,
                cancel,
                handle.authenticate_password(user.clone(), password),
            )
            .await?;
            if res.success() {
                return Ok(());
            }
        }
        "private_key" => {
            let key = load_private_key(config)?;
            let hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| SshError::new(SshErrorCode::AuthFailed, e.to_string()))?
                .flatten();
            let res = auth_with_timeout(
                AUTH_CHECK_TIMEOUT,
                cancel,
                handle.authenticate_publickey(
                    user.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                ),
            )
            .await?;
            if res.success() {
                return Ok(());
            }
        }
        other => {
            return Err(SshError::new(
                SshErrorCode::InvalidKey,
                format!("Unknown auth method: {other}"),
            ));
        }
    }

    let kbd = auth_with_timeout(
        AUTH_TIMEOUT,
        cancel,
        handle.authenticate_keyboard_interactive_start(user, None),
    )
    .await;
    match kbd {
        Ok(KeyboardInteractiveAuthResponse::Success) => Ok(()),
        Ok(response) => {
            complete_keyboard_interactive_with_app(handle, app, config, cancel, response).await
        }
        Err(err) if err.message == "Authentication cancelled" => Err(err),
        Err(_) => Err(SshError::new(
            SshErrorCode::AuthFailed,
            "Authentication failed",
        )),
    }
}

async fn complete_keyboard_interactive_with_app(
    handle: &mut Handle<ClientHandler>,
    app: &AppHandle,
    config: &ConnectConfig,
    cancel: &mut tokio::sync::oneshot::Receiver<()>,
    mut response: russh::client::KeyboardInteractiveAuthResponse,
) -> Result<(), SshError> {
    use russh::client::KeyboardInteractiveAuthResponse;

    loop {
        match response {
            KeyboardInteractiveAuthResponse::Success => return Ok(()),
            KeyboardInteractiveAuthResponse::Failure { .. } => {
                return Err(SshError::new(
                    SshErrorCode::AuthFailed,
                    "Authentication failed",
                ));
            }
            KeyboardInteractiveAuthResponse::InfoRequest {
                name,
                instructions,
                prompts,
            } => {
                let text = format!("{name}\n{instructions}").trim().to_string();
                if !text.is_empty() {
                    emit_auth_banner(app, &config.host_id, &text);
                }
                for prompt in &prompts {
                    if !prompt.prompt.trim().is_empty() {
                        emit_auth_banner(app, &config.host_id, &prompt.prompt);
                    }
                }

                let answers: Vec<String> = prompts
                    .iter()
                    .map(|prompt| {
                        if prompt.echo {
                            String::new()
                        } else {
                            config.password.clone().unwrap_or_default()
                        }
                    })
                    .collect();

                response = auth_with_timeout(
                    AUTH_CHECK_TIMEOUT,
                    cancel,
                    handle.authenticate_keyboard_interactive_respond(answers),
                )
                .await?;
            }
        }
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

pub(crate) fn load_known_hosts(app: &AppHandle) -> Result<KnownHosts, SshError> {
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

pub(crate) fn save_known_hosts(app: &AppHandle, known: &KnownHosts) -> Result<(), SshError> {
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

impl SshManager {
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
            app: app.clone(),
            host_id: config.host_id.clone(),
        };

        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();
        {
            let mut inner = self.inner.lock().await;
            if let Some(prev) = inner.connect_cancels.remove(&config.host_id) {
                let _ = prev.send(());
            }
            inner
                .connect_cancels
                .insert(config.host_id.clone(), cancel_tx);
        }

        let conf = Arc::new(client::Config {
            inactivity_timeout: None,
            keepalive_interval: Some(Duration::from_secs(30)),
            ..Default::default()
        });

        let addr = format!("{}:{}", config.hostname, config.port);
        let socks = match resolve_connect_addrs(&addr, &config.hostname).await {
            Ok(socks) => socks,
            Err(err) => {
                self.clear_connect_cancel(&config.host_id).await;
                return Err(err);
            }
        };

        let mut handle = None;
        let mut last_err = None;
        for sock in socks {
            match tokio::time::timeout(
                CONNECT_TIMEOUT,
                client::connect(Arc::clone(&conf), sock, handler.clone()),
            )
            .await
            {
                Ok(Ok(h)) => {
                    handle = Some(h);
                    break;
                }
                Ok(Err(e)) => last_err = Some(e.to_string()),
                Err(_) => {
                    last_err = Some(format!("Connection to {sock} timed out after 15s"));
                }
            }
        }
        let mut handle = match handle {
            Some(h) => h,
            None => {
                self.clear_connect_cancel(&config.host_id).await;
                return Err(SshError::new(
                    SshErrorCode::ConnectFailed,
                    last_err.unwrap_or_else(|| format!("Connection to {addr} failed")),
                ));
            }
        };

        let key = match captured.lock().await.take() {
            Some(k) => k,
            None => {
                self.clear_connect_cancel(&config.host_id).await;
                let _ = handle
                    .disconnect(Disconnect::ByApplication, "no host key", "")
                    .await;
                return Err(SshError::new(
                    SshErrorCode::Internal,
                    "Server host key was not presented",
                ));
            }
        };

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
            self.clear_connect_cancel(&config.host_id).await;
            let _ = handle
                .disconnect(Disconnect::ByApplication, "host key not trusted", "")
                .await;
            return Err(err);
        }

        let auth_result = authenticate(&mut handle, app, &config, &mut cancel_rx).await;
        self.clear_connect_cancel(&config.host_id).await;
        if let Err(err) = auth_result {
            let _ = handle
                .disconnect(Disconnect::ByApplication, "auth failed", "")
                .await;
            return Err(err);
        }

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
