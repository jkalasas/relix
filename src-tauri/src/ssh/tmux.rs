use std::sync::Arc;

use russh::ChannelMsg;

use super::connection::{handle_is_closed, SharedHandle};
use super::error::{SshError, SshErrorCode};
use super::manager::SshManager;

const DEFAULT_SESSION: &str = "relix";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmuxWindow {
    pub id: String,
    pub index: u32,
    pub name: String,
    pub active: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmuxBootstrapResult {
    pub session: String,
    pub windows: Vec<TmuxWindow>,
}

fn sh_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn resolve_session(session: Option<String>) -> Result<String, SshError> {
    let name = session
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_SESSION.to_string());
    if name.contains([':', '.', '\n', '\r', '\0']) {
        return Err(SshError::new(
            SshErrorCode::Internal,
            "Invalid tmux session name",
        ));
    }
    Ok(name)
}

fn client_session_name(session: &str, window_id: &str) -> String {
    let id = window_id.trim().trim_start_matches('@');
    format!("{session}_w{id}")
}

/// Each Relix tab needs its own tmux session (grouped with the base session).
/// Multiple clients on one session share a single current window, so plain
/// `attach -t base:window` makes every tab show the last selected window.
pub(crate) fn attach_command(session: &str, window_id: &str) -> String {
    let window_id = window_id.trim();
    let client = client_session_name(session, window_id);
    let client_q = sh_single_quote(&client);
    let base_q = sh_single_quote(session);
    // Client sessions are separate from the base and default to status on.
    let script = format!(
        "tmux has-session -t {client_q} 2>/dev/null || tmux new-session -d -s {client_q} -t {base_q}; tmux set-option -t {client_q} status off; tmux set-option -t {base_q} status off; tmux set-option -t {client_q} set-titles off; tmux select-window -t {client_q}:{window_id}; exec tmux attach-session -t {client_q}"
    );
    format!("bash -lc {}", sh_single_quote(&script))
}

fn ensure_session_command(session: &str) -> String {
    let quoted = sh_single_quote(session);
    format!("tmux has-session -t {quoted} 2>/dev/null || tmux new-session -d -s {quoted}")
}

/// Relix tabs are the window chrome — hide tmux's own status bar.
fn configure_session_command(session: &str) -> String {
    let quoted = sh_single_quote(session);
    format!(
        "tmux set-option -t {quoted} status off ; tmux set-option -t {quoted} set-titles off"
    )
}

fn kill_window_command(session: &str, window_id: &str) -> String {
    let window_id = window_id.trim();
    let client = client_session_name(session, window_id);
    let client_q = sh_single_quote(&client);
    format!(
        "tmux kill-window -t {}:{} ; tmux kill-session -t {} 2>/dev/null || true",
        session,
        window_id,
        client_q,
    )
}

fn kill_session_command(session: &str) -> String {
    // Relix tabs attach via grouped client sessions named `{base}_w{windowId}`.
    // Killing the base first transfers windows into a remaining group member, so
    // clients must die before the base. The script is wrapped in bash -lc with
    // single quotes — session must be double-quoted inside, not sh_single_quote,
    // or the outer quotes break (base='relix' inside '…' is invalid).
    let session_escaped = session
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`");
    let script = format!(
        "set +e; base=\"{session_escaped}\"; \
for s in $(tmux list-sessions -F '#{{session_name}}' 2>/dev/null); do \
  case \"$s\" in \
    \"${{base}}_w\"*) tmux kill-session -t \"$s\" 2>/dev/null ;; \
  esac; \
done; \
if tmux has-session -t \"$base\" 2>/dev/null; then \
  for w in $(tmux list-windows -t \"$base\" -F '#{{window_id}}' 2>/dev/null); do \
    tmux kill-window -t \"$base:$w\" 2>/dev/null; \
  done; \
  tmux kill-session -t \"$base\" 2>/dev/null; \
fi; \
for s in $(tmux list-sessions -F '#{{session_name}}' 2>/dev/null); do \
  case \"$s\" in \
    \"$base\"|\"${{base}}_w\"*) tmux kill-session -t \"$s\" 2>/dev/null ;; \
  esac; \
done; \
if tmux has-session -t \"$base\" 2>/dev/null; then exit 1; fi; \
exit 0"
    );
    format!("bash -lc {}", sh_single_quote(&script))
}

fn list_windows_command(session: &str) -> String {
    format!(
        "tmux list-windows -t {} -F '#{{window_id}}\t#{{window_index}}\t#{{window_name}}\t#{{window_active}}'",
        sh_single_quote(session)
    )
}

fn pane_path_command(session: &str, window_id: &str) -> String {
    format!(
        "tmux display-message -p -t {}:{} '#{{pane_current_path}}'",
        session,
        window_id.trim()
    )
}

fn new_window_command(
    session: &str,
    name: Option<&str>,
    command: Option<&str>,
    cwd: Option<&str>,
) -> String {
    let mut parts = vec![
        "tmux new-window".to_string(),
        format!("-t {}", sh_single_quote(session)),
        "-P".to_string(),
        "-F '#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}'".to_string(),
    ];
    if let Some(cwd) = cwd.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(format!("-c {}", sh_single_quote(cwd)));
    }
    if let Some(name) = name.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(format!("-n {}", sh_single_quote(name)));
    }
    if let Some(command) = command.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(command.to_string());
    }
    parts.join(" ")
}

fn parse_window_line(line: &str) -> Option<TmuxWindow> {
    let mut parts = line.splitn(4, '\t');
    let id = parts.next()?.trim();
    let index = parts.next()?.trim().parse().ok()?;
    let name = parts.next()?.trim();
    let active = matches!(parts.next()?.trim(), "1" | "true");
    if id.is_empty() {
        return None;
    }
    Some(TmuxWindow {
        id: id.to_string(),
        index,
        name: if name.is_empty() {
            format!("window {index}")
        } else {
            name.to_string()
        },
        active,
    })
}

fn parse_windows_stdout(stdout: &str) -> Vec<TmuxWindow> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(parse_window_line)
        .collect()
}

fn parse_windows(stdout: &str) -> Result<Vec<TmuxWindow>, SshError> {
    let windows = parse_windows_stdout(stdout);
    if windows.is_empty() {
        return Err(SshError::new(
            SshErrorCode::Internal,
            "No tmux windows found",
        ));
    }
    Ok(windows)
}

fn is_missing_session_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("can't find")
        || lower.contains("no server running")
        || lower.contains("error connecting to")
        || lower.contains("no current target")
        || lower.contains("session not found")
}

async fn exec_capture(handle: &SharedHandle, command: &str) -> Result<String, SshError> {
    let mut channel = {
        let guard = handle.lock().await;
        guard
            .channel_open_session()
            .await
            .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?
    };

    channel
        .exec(true, command)
        .await
        .map_err(|e| SshError::new(SshErrorCode::Internal, e.to_string()))?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_status: Option<u32> = None;

    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { ref data }) => stdout.extend_from_slice(data),
            Some(ChannelMsg::ExtendedData { ref data, .. }) => stderr.extend_from_slice(data),
            Some(ChannelMsg::ExitStatus { exit_status: code }) => {
                exit_status = Some(code);
            }
            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
            _ => {}
        }
    }

    let stdout_text = String::from_utf8_lossy(&stdout).to_string();
    let stderr_text = String::from_utf8_lossy(&stderr).trim().to_string();
    if exit_status.unwrap_or(0) != 0 {
        let message = if stderr_text.is_empty() {
            format!("Remote command failed (exit {})", exit_status.unwrap_or(1))
        } else {
            stderr_text
        };
        let lower = message.to_lowercase();
        if lower.contains("tmux: command not found")
            || lower.contains("command not found")
            || lower.contains("no such file")
        {
            return Err(SshError::new(
                SshErrorCode::Internal,
                "tmux is not installed on the remote host",
            ));
        }
        return Err(SshError::new(SshErrorCode::Internal, message));
    }

    Ok(stdout_text)
}

impl SshManager {
    async fn live_handle(&self, host_id: &str) -> Result<SharedHandle, SshError> {
        let mut inner = self.inner.lock().await;
        match inner.connections.get(host_id) {
            Some(conn) if !handle_is_closed(&conn.handle) => Ok(Arc::clone(&conn.handle)),
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

    pub async fn tmux_bootstrap(
        &self,
        host_id: String,
        session: Option<String>,
    ) -> Result<TmuxBootstrapResult, SshError> {
        let session = resolve_session(session)?;
        let handle = self.live_handle(&host_id).await?;
        exec_capture(&handle, &ensure_session_command(&session)).await?;
        let _ = exec_capture(&handle, &configure_session_command(&session)).await;
        let stdout = exec_capture(&handle, &list_windows_command(&session)).await?;
        let windows = parse_windows(&stdout)?;
        Ok(TmuxBootstrapResult { session, windows })
    }

    async fn tmux_pane_path(
        handle: &SharedHandle,
        session: &str,
        window_id: &str,
    ) -> Option<String> {
        let stdout = exec_capture(handle, &pane_path_command(session, window_id))
            .await
            .ok()?;
        let path = stdout.lines().next().unwrap_or("").trim();
        if path.is_empty() || path == "-" {
            return None;
        }
        Some(path.to_string())
    }

    pub async fn tmux_window_path(
        &self,
        host_id: String,
        session: Option<String>,
        window_id: String,
    ) -> Result<Option<String>, SshError> {
        let session = resolve_session(session)?;
        let window_id = window_id.trim().to_string();
        if window_id.is_empty() {
            return Err(SshError::new(
                SshErrorCode::Internal,
                "Missing tmux window id",
            ));
        }
        let handle = self.live_handle(&host_id).await?;
        Ok(Self::tmux_pane_path(&handle, &session, &window_id).await)
    }

    pub async fn tmux_new_window(
        &self,
        host_id: String,
        session: Option<String>,
        name: Option<String>,
        command: Option<String>,
        cwd: Option<String>,
        source_window_id: Option<String>,
    ) -> Result<TmuxWindow, SshError> {
        let session = resolve_session(session)?;
        let handle = self.live_handle(&host_id).await?;
        exec_capture(&handle, &ensure_session_command(&session)).await?;
        let _ = exec_capture(&handle, &configure_session_command(&session)).await;

        // Prefer live pane path from the source window — OSC7 often does not
        // pass through tmux, so frontend cwd is frequently missing.
        let mut resolved_cwd = cwd.filter(|value| !value.trim().is_empty());
        if let Some(window_id) = source_window_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            if let Some(path) = Self::tmux_pane_path(&handle, &session, window_id).await {
                resolved_cwd = Some(path);
            }
        }

        let stdout = exec_capture(
            &handle,
            &new_window_command(
                &session,
                name.as_deref(),
                command.as_deref(),
                resolved_cwd.as_deref(),
            ),
        )
        .await?;
        parse_windows(&stdout)?
            .into_iter()
            .next()
            .ok_or_else(|| SshError::new(SshErrorCode::Internal, "Failed to create tmux window"))
    }

    pub async fn tmux_list_windows(
        &self,
        host_id: String,
        session: Option<String>,
    ) -> Result<TmuxBootstrapResult, SshError> {
        let session = resolve_session(session)?;
        let handle = self.live_handle(&host_id).await?;
        match exec_capture(&handle, &list_windows_command(&session)).await {
            Ok(stdout) => Ok(TmuxBootstrapResult {
                session,
                windows: parse_windows_stdout(&stdout),
            }),
            Err(error) if is_missing_session_error(&error.message) => Ok(TmuxBootstrapResult {
                session,
                windows: Vec::new(),
            }),
            Err(error) => Err(error),
        }
    }

    pub async fn tmux_kill_window(
        &self,
        host_id: String,
        session: Option<String>,
        window_id: String,
    ) -> Result<(), SshError> {
        let session = resolve_session(session)?;
        let window_id = window_id.trim().to_string();
        if window_id.is_empty() {
            return Err(SshError::new(
                SshErrorCode::Internal,
                "Missing tmux window id",
            ));
        }
        let handle = self.live_handle(&host_id).await?;
        match exec_capture(&handle, &kill_window_command(&session, &window_id)).await {
            Ok(_) => Ok(()),
            Err(error) if is_missing_session_error(&error.message) => Ok(()),
            Err(error) => Err(error),
        }
    }

    pub async fn tmux_kill_session(
        &self,
        host_id: String,
        session: Option<String>,
    ) -> Result<(), SshError> {
        let session = resolve_session(session)?;
        let handle = self.live_handle(&host_id).await?;
        match exec_capture(&handle, &kill_session_command(&session)).await {
            Ok(_) => Ok(()),
            Err(error) if is_missing_session_error(&error.message) => Ok(()),
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        attach_command, configure_session_command, ensure_session_command, kill_session_command,
        kill_window_command, list_windows_command, new_window_command, pane_path_command,
        parse_window_line, parse_windows, parse_windows_stdout, resolve_session, sh_single_quote,
    };

    #[test]
    fn quotes_session_names() {
        assert_eq!(sh_single_quote("relix"), "'relix'");
        assert_eq!(sh_single_quote("a'b"), "'a'\"'\"'b'");
    }

    #[test]
    fn defaults_session_name() {
        assert_eq!(resolve_session(None).unwrap(), "relix");
        assert_eq!(resolve_session(Some("  work  ".into())).unwrap(), "work");
        assert!(resolve_session(Some("bad:name".into())).is_err());
    }

    #[test]
    fn builds_ensure_list_and_configure_commands() {
        assert_eq!(
            ensure_session_command("relix"),
            "tmux has-session -t 'relix' 2>/dev/null || tmux new-session -d -s 'relix'"
        );
        assert!(list_windows_command("relix").contains("list-windows -t 'relix'"));
        assert!(configure_session_command("relix").contains("status off"));
        assert!(kill_window_command("relix", "@3").contains("kill-window -t relix:@3"));
        assert!(kill_window_command("relix", "@3").contains("kill-session -t 'relix_w3'"));
        let kill = kill_session_command("relix");
        assert!(kill.starts_with("bash -lc "));
        assert!(kill.contains("base=\"relix\""));
        assert!(kill.contains("kill-session"));
        assert!(kill.contains("#{session_name}"));
        assert!(kill.contains("#{window_id}"));
        assert!(kill.contains("${base}_w"));
        // Must not embed single-quoted session inside the outer bash -lc quotes.
        assert!(!kill.contains("base='relix'"));
    }

    #[test]
    fn builds_new_window_and_attach() {
        assert_eq!(
            new_window_command("relix", Some("claude"), Some("claude"), Some("/home/u/proj")),
            "tmux new-window -t 'relix' -P -F '#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}' -c '/home/u/proj' -n 'claude' claude"
        );
        assert_eq!(
            new_window_command("relix", Some("shell"), None, None),
            "tmux new-window -t 'relix' -P -F '#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}' -n 'shell'"
        );
        let attach = attach_command("relix", "@3");
        assert!(attach.starts_with("bash -lc "));
        assert!(attach.contains("relix_w3"));
        assert!(attach.contains("new-session -d -s"));
        assert!(attach.contains("status off"));
        assert!(attach.contains("select-window -t"));
        assert!(attach.contains("attach-session -t"));
        assert!(attach.contains(":@3"));
        assert_eq!(
            pane_path_command("relix", "@3"),
            "tmux display-message -p -t relix:@3 '#{pane_current_path}'"
        );
    }

    #[test]
    fn parses_window_lines() {
        let windows = parse_windows("@1\t0\tshell\t1\n@2\t1\tclaude\t0\n").unwrap();
        assert_eq!(windows.len(), 2);
        assert_eq!(windows[0].id, "@1");
        assert_eq!(windows[0].index, 0);
        assert_eq!(windows[0].name, "shell");
        assert!(windows[0].active);
        assert_eq!(windows[1].name, "claude");
        assert!(!windows[1].active);
        assert!(parse_window_line("").is_none());
        assert!(parse_windows_stdout("").is_empty());
    }
}
