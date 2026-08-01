use std::collections::HashMap;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use crate::git::error::{GitError, GitErrorCode, Result};
use crate::git::types::{
    GitOutput, DEFAULT_TIMEOUT_SECS, MAX_OUTPUT_BYTES, MIN_GIT_VERSION,
};
use crate::ssh::connection::SharedHandle;
use crate::ssh::local_shell::is_local_host_id;

const AVAILABILITY_TTL: Duration = Duration::from_secs(60);

#[derive(Clone)]
enum Availability {
    Ok,
    NotInstalled,
    TooOld(String),
}

struct AvailabilityCache {
    value: Availability,
    checked_at: Instant,
}

static GIT_AVAILABILITY: OnceLock<Mutex<HashMap<String, AvailabilityCache>>> = OnceLock::new();

fn availability_map() -> &'static Mutex<HashMap<String, AvailabilityCache>> {
    GIT_AVAILABILITY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub enum GitBackend {
    Local,
    Remote { handle: SharedHandle },
}

impl GitBackend {
    pub async fn run(
        &self,
        cwd: &str,
        args: &[&str],
        timeout_secs: u64,
    ) -> Result<GitOutput> {
        match self {
            GitBackend::Local => {
                let cwd = cwd.to_string();
                let args: Vec<String> = args.iter().map(|s| (*s).to_string()).collect();
                tokio::task::spawn_blocking(move || {
                    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
                    run_local(&cwd, &arg_refs, timeout_secs)
                })
                .await
                .map_err(|e| GitError::new(GitErrorCode::Internal, e.to_string()))?
            }
            GitBackend::Remote { handle } => run_remote(handle, cwd, args, timeout_secs).await,
        }
    }
}

pub async fn backend_for_host(
    host_id: &str,
    manager: &crate::ssh::manager::SshManager,
) -> Result<GitBackend> {
    if is_local_host_id(host_id) {
        if cfg!(any(target_os = "android", target_os = "ios")) {
            return Err(GitError::new(
                GitErrorCode::Unavailable,
                "local git is not available on mobile",
            ));
        }
        return Ok(GitBackend::Local);
    }
    let handle = manager.live_handle(host_id).await.map_err(|e| {
        if matches!(e.code, crate::ssh::error::SshErrorCode::NotConnected) {
            GitError::new(GitErrorCode::NotConnected, e.message)
        } else {
            GitError::new(GitErrorCode::Internal, e.message)
        }
    })?;
    Ok(GitBackend::Remote { handle })
}

pub async fn ensure_git_available(backend: &GitBackend, host_id: &str) -> Result<()> {
    let cached = {
        let guard = availability_map()
            .lock()
            .expect("git availability poisoned");
        guard
            .get(host_id)
            .filter(|entry| entry.checked_at.elapsed() < AVAILABILITY_TTL)
            .map(|entry| entry.value.clone())
    };

    let value = match cached {
        Some(value) => value,
        None => {
            let fresh = probe_git_availability(backend).await?;
            let mut guard = availability_map()
                .lock()
                .expect("git availability poisoned");
            guard.insert(
                host_id.to_string(),
                AvailabilityCache {
                    value: fresh.clone(),
                    checked_at: Instant::now(),
                },
            );
            fresh
        }
    };

    map_availability(value)
}

async fn probe_git_availability(backend: &GitBackend) -> Result<Availability> {
    let output = match backend.run("", &["--version"], 10).await {
        Ok(output) => output,
        Err(err) if matches!(err.code, GitErrorCode::SpawnFailed) => {
            return Ok(Availability::NotInstalled);
        }
        Err(err) => return Err(err),
    };

    if output.timed_out || output.exit_code != Some(0) {
        return Ok(Availability::NotInstalled);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = parse_git_version(stdout.trim()).unwrap_or_else(|| "unknown".into());
    if !version_meets_minimum(&version, MIN_GIT_VERSION) {
        return Ok(Availability::TooOld(version));
    }
    Ok(Availability::Ok)
}

fn map_availability(value: Availability) -> Result<()> {
    match value {
        Availability::Ok => Ok(()),
        Availability::NotInstalled => Err(GitError::new(
            GitErrorCode::NotInstalled,
            "git is not installed",
        )),
        Availability::TooOld(found) => Err(GitError::new(
            GitErrorCode::TooOld,
            format!("git {found} is too old; require {MIN_GIT_VERSION}+"),
        )),
    }
}

fn parse_git_version(line: &str) -> Option<String> {
    line.split_whitespace()
        .find(|tok| tok.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(|s| s.split('.').take(3).collect::<Vec<_>>().join("."))
}

fn version_meets_minimum(found: &str, required: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let f = parse(found);
    let r = parse(required);
    for (i, &b) in r.iter().enumerate() {
        let a = f.get(i).copied().unwrap_or(0);
        if a > b {
            return true;
        }
        if a < b {
            return false;
        }
    }
    true
}

fn run_local(cwd: &str, args: &[&str], timeout_secs: u64) -> Result<GitOutput> {
    let timeout = Duration::from_secs(timeout_secs.max(1));
    let mut cmd = Command::new("git");
    cmd.args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if !cwd.is_empty() {
        cmd.current_dir(cwd);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| GitError::new(GitErrorCode::SpawnFailed, e.to_string()))?;

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| GitError::new(GitErrorCode::SpawnFailed, "no stdout pipe"))?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| GitError::new(GitErrorCode::SpawnFailed, "no stderr pipe"))?;

    let stdout_handle = thread::spawn(move || drain(&mut stdout_pipe));
    let stderr_handle = thread::spawn(move || drain(&mut stderr_pipe));

    let child = Arc::new(Mutex::new(child));
    let (tx, rx) = mpsc::channel();
    let waiter = Arc::clone(&child);
    thread::spawn(move || loop {
        let mut guard = match waiter.lock() {
            Ok(g) => g,
            Err(_) => {
                let _ = tx.send(Err(std::io::Error::other("git child lock poisoned")));
                return;
            }
        };
        match guard.try_wait() {
            Ok(Some(status)) => {
                let _ = tx.send(Ok(status));
                return;
            }
            Ok(None) => {
                drop(guard);
                thread::sleep(Duration::from_millis(20));
            }
            Err(e) => {
                let _ = tx.send(Err(e));
                return;
            }
        }
    });

    let (exit_code, timed_out) = match rx.recv_timeout(timeout) {
        Ok(Ok(status)) => (status.code(), false),
        Ok(Err(e)) => {
            return Err(GitError::new(GitErrorCode::SpawnFailed, e.to_string()));
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            if let Ok(mut guard) = child.lock() {
                let _ = guard.kill();
                let _ = guard.wait();
            }
            (None, true)
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            return Err(GitError::new(
                GitErrorCode::SpawnFailed,
                "git wait thread disconnected",
            ));
        }
    };

    let (stdout, stdout_truncated) = stdout_handle.join().unwrap_or((Vec::new(), false));
    let (stderr, stderr_truncated) = stderr_handle.join().unwrap_or((Vec::new(), false));

    Ok(GitOutput {
        stdout,
        stderr,
        exit_code,
        timed_out,
        truncated: stdout_truncated || stderr_truncated,
    })
}

async fn run_remote(
    _handle: &SharedHandle,
    _cwd: &str,
    _args: &[&str],
    _timeout_secs: u64,
) -> Result<GitOutput> {
    Err(GitError::new(
        GitErrorCode::Internal,
        "remote git runner not implemented",
    ))
}

pub fn ensure_success(output: &GitOutput, context: &'static str) -> Result<()> {
    if output.timed_out {
        return Err(GitError::new(
            GitErrorCode::TimedOut,
            format!("{context} timed out"),
        ));
    }
    if output.exit_code == Some(0) {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if let Some(err) = classify_auth_error(&stderr) {
        return Err(err);
    }
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "unknown git error".into()
    };
    Err(GitError::command(context, detail))
}

fn classify_auth_error(stderr: &str) -> Option<GitError> {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("authentication failed")
        || lower.contains("permission denied (publickey)")
        || lower.contains("invalid credentials")
    {
        return Some(GitError::new(
            GitErrorCode::AuthRequired,
            stderr.lines().next().unwrap_or(stderr).to_string(),
        ));
    }
    None
}

pub async fn git_stdout_line_opt(
    backend: &GitBackend,
    cwd: &str,
    args: &[&str],
) -> Result<Option<String>> {
    let output = backend.run(cwd, args, DEFAULT_TIMEOUT_SECS).await?;
    if output.timed_out {
        return Err(GitError::new(
            GitErrorCode::TimedOut,
            "git command timed out",
        ));
    }
    if output.exit_code != Some(0) {
        return Ok(None);
    }
    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    let line = stdout.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        Ok(None)
    } else {
        Ok(Some(line.to_string()))
    }
}

pub async fn git_stdout_lines(
    backend: &GitBackend,
    cwd: &str,
    args: &[&str],
) -> Result<Vec<String>> {
    let output = backend.run(cwd, args, DEFAULT_TIMEOUT_SECS).await?;
    if output.timed_out {
        return Err(GitError::new(
            GitErrorCode::TimedOut,
            "git command timed out",
        ));
    }
    if output.exit_code != Some(0) {
        return Ok(Vec::new());
    }
    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    Ok(stdout
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .collect())
}

fn drain<R: Read>(reader: &mut R) -> (Vec<u8>, bool) {
    let mut out: Vec<u8> = Vec::with_capacity(64 * 1024);
    let mut buf = [0u8; 16 * 1024];
    let mut truncated = false;
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if out.len() >= MAX_OUTPUT_BYTES {
                    truncated = true;
                    continue;
                }
                let take = (MAX_OUTPUT_BYTES - out.len()).min(n);
                out.extend_from_slice(&buf[..take]);
                if take < n {
                    truncated = true;
                }
            }
            Err(_) => break,
        }
    }
    (out, truncated)
}

#[cfg(test)]
mod tests {
    use super::{parse_git_version, version_meets_minimum};

    #[test]
    fn parse_version_line() {
        assert_eq!(
            parse_git_version("git version 2.42.0"),
            Some("2.42.0".into())
        );
        assert_eq!(
            parse_git_version("git version 2.39.3 (Apple Git-145)"),
            Some("2.39.3".into())
        );
        assert_eq!(parse_git_version("not a version"), None);
    }

    #[test]
    fn version_compare() {
        assert!(version_meets_minimum("2.23.0", "2.23"));
        assert!(version_meets_minimum("2.40.1", "2.23"));
        assert!(version_meets_minimum("3.0.0", "2.23"));
        assert!(!version_meets_minimum("2.22.0", "2.23"));
        assert!(!version_meets_minimum("1.9.5", "2.23"));
        assert!(version_meets_minimum("2.23.5", "2.23.4"));
        assert!(!version_meets_minimum("2.23.3", "2.23.4"));
    }
}
