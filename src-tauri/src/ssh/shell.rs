use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use russh::{ChannelMsg, ChannelWriteHalf};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::connection::handle_is_closed;
use super::error::{SshError, SshErrorCode};
use super::manager::{HostId, SshManager};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenShellResult {
    pub session_id: String,
}

pub(crate) struct LiveShell {
    pub(crate) host_id: HostId,
    pub(crate) channel: Arc<Mutex<ChannelWriteHalf<russh::client::Msg>>>,
    pub(crate) abort: tokio::task::AbortHandle,
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
            let script = format!(
                "cd {} && exec \"${{SHELL:-/bin/bash}}\" -il",
                sh_single_quote(path),
            );
            ShellRemote::Exec(bash_login(&script))
        }
        (None, None) => ShellRemote::RequestShell,
    }
}

impl SshManager {
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
