use std::io::{Read, Write};
use std::sync::{Arc, Mutex as StdMutex};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::error::{SshError, SshErrorCode};
use super::manager::{HostId, SshManagerInner};
use super::shell::{LiveShell, ShellBackend};

pub const LOCAL_HOST_ID: &str = "local";

pub fn is_local_host_id(id: &str) -> bool {
    id == LOCAL_HOST_ID
}

pub fn local_shell_available() -> bool {
    cfg!(not(mobile))
}

fn resolve_shell_program() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL")
            .ok()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| {
                if std::path::Path::new("/bin/bash").exists() {
                    "/bin/bash".into()
                } else {
                    "/bin/sh".into()
                }
            })
    }
}

#[cfg(not(mobile))]
fn build_local_command(
    command: Option<String>,
    cwd: Option<String>,
) -> portable_pty::CommandBuilder {
    use portable_pty::CommandBuilder;

    let shell = resolve_shell_program();
    let command = command.filter(|value| !value.is_empty());
    let cwd = cwd.filter(|value| !value.is_empty());

    let mut cmd = CommandBuilder::new(&shell);

    #[cfg(windows)]
    {
        if let Some(command) = command {
            cmd.arg("/C");
            cmd.arg(command);
        }
    }

    #[cfg(not(windows))]
    {
        match command {
            Some(command) => {
                cmd.arg("-l");
                cmd.arg("-c");
                cmd.arg(command);
            }
            None => {
                cmd.arg("-l");
            }
        }
    }

    if let Some(path) = cwd {
        cmd.cwd(path);
    }

    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd
}

#[cfg(not(mobile))]
pub(crate) struct LocalShellHandles {
    pub(crate) writer: Arc<StdMutex<Box<dyn Write + Send>>>,
    pub(crate) master: Arc<StdMutex<Box<dyn portable_pty::MasterPty + Send>>>,
    pub(crate) child: Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

pub(crate) async fn open_local_shell(
    app: &AppHandle,
    shells_map: Arc<tokio::sync::Mutex<SshManagerInner>>,
    cols: u32,
    rows: u32,
    command: Option<String>,
    cwd: Option<String>,
) -> Result<String, SshError> {
    #[cfg(mobile)]
    {
        let _ = (app, shells_map, cols, rows, command, cwd);
        return Err(SshError::new(
            SshErrorCode::Internal,
            "Local shell is only available on desktop",
        ));
    }

    #[cfg(not(mobile))]
    {
        open_local_shell_desktop(app, shells_map, cols, rows, command, cwd).await
    }
}

#[cfg(not(mobile))]
async fn open_local_shell_desktop(
    app: &AppHandle,
    shells_map: Arc<tokio::sync::Mutex<SshManagerInner>>,
    cols: u32,
    rows: u32,
    command: Option<String>,
    cwd: Option<String>,
) -> Result<String, SshError> {
    use portable_pty::{native_pty_system, PtySize};

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(1) as u16,
            cols: cols.max(1) as u16,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

    let cmd = build_local_command(command, cwd);
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

    let session_id = Uuid::new_v4().to_string();
    let host_id: HostId = LOCAL_HOST_ID.to_string();
    let app_handle = app.clone();
    let sid = session_id.clone();
    let hid = host_id.clone();
    let cleanup_sid = session_id.clone();

    let writer = Arc::new(StdMutex::new(writer));
    let master = Arc::new(StdMutex::new(pair.master));
    let child = Arc::new(StdMutex::new(child));

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Option<Vec<u8>>>();
    let reader_thread = std::thread::Builder::new()
        .name("relix-local-pty".into())
        .spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(Some(buf[..n].to_vec())).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = tx.send(None);
        })
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

    let shells_for_task = Arc::clone(&shells_map);
    let join = tokio::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            match chunk {
                Some(data) => {
                    let encoded = B64.encode(&data);
                    let _ = app_handle.emit(
                        "ssh://data",
                        serde_json::json!({
                            "sessionId": sid,
                            "data": encoded,
                        }),
                    );
                }
                None => break,
            }
        }

        let removed = {
            let mut inner = shells_for_task.lock().await;
            inner.shells.remove(&cleanup_sid)
        };
        if let Some(shell) = removed {
            shell.shutdown();
            let _ = app_handle.emit(
                "ssh://shell-closed",
                serde_json::json!({
                    "sessionId": sid,
                    "hostId": hid,
                    "reason": "eof",
                }),
            );
        }

        let _ = reader_thread.join();
    });

    let handles = LocalShellHandles {
        writer,
        master,
        child,
    };

    {
        let mut inner = shells_map.lock().await;
        inner.shells.insert(
            session_id.clone(),
            LiveShell {
                host_id,
                backend: ShellBackend::Local(handles),
                abort: join.abort_handle(),
            },
        );
    }

    Ok(session_id)
}

#[cfg(not(mobile))]
pub(crate) fn shutdown_local(handles: &LocalShellHandles) {
    if let Ok(mut child) = handles.child.lock() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::{is_local_host_id, resolve_shell_program, LOCAL_HOST_ID};

    #[test]
    fn local_host_id_matches() {
        assert!(is_local_host_id(LOCAL_HOST_ID));
        assert!(!is_local_host_id("other"));
    }

    #[test]
    fn resolves_a_shell_program() {
        let program = resolve_shell_program();
        assert!(!program.is_empty());
    }
}
