use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

use super::connection::{relay_tcp_channel, RemoteRoute, RemoteRoutes, SharedHandle};
use super::error::{SshError, SshErrorCode};
use super::manager::{HostId, SshManager};
use super::socks::{accept_socks5_connect, reply_failure, reply_success};

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

pub(crate) enum LiveForwardKind {
    Local,
    Remote { bind_host: String, bind_port: u32 },
    Dynamic,
}

pub(crate) struct LiveForward {
    pub(crate) host_id: HostId,
    pub(crate) kind: LiveForwardKind,
    pub(crate) abort: Option<tokio::task::AbortHandle>,
    pub(crate) children: Arc<Mutex<Vec<tokio::task::AbortHandle>>>,
    pub(crate) handle: Option<SharedHandle>,
    pub(crate) remote_routes: Option<RemoteRoutes>,
}

pub(crate) async fn abort_forward(forward: &LiveForward) {
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

impl SshManager {
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
                format!(
                    "Could not bind {bind_addr}: {e}. On mobile, use ports above 1024; 0.0.0.0 listens for LAN clients."
                ),
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
                format!(
                    "Could not bind {bind_addr}: {e}. On mobile, use ports above 1024; 0.0.0.0 listens for LAN clients."
                ),
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
