use std::collections::HashMap;
use std::net::ToSocketAddrs;
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

pub(crate) struct ClientHandler {
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

pub(crate) async fn authenticate(
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
