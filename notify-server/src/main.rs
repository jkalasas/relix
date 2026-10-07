use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;

pub const DEFAULT_PORT: u16 = 41237;
pub const SEND_PATH: &str = "/send-notification";
pub const EVENTS_PATH: &str = "/events";
pub const HEALTH_PATH: &str = "/healthz";

fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", now.as_secs(), now.subsec_millis())
}

fn verbose_enabled() -> bool {
    std::env::args().any(|a| a == "--verbose" || a == "-v")
        || std::env::var("RELIX_NOTIFY_VERBOSE")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
}

fn log_line(level: &str, message: &str) -> String {
    format!("[{}] relix-notify {level}: {message}", timestamp())
}

macro_rules! log_info {
    ($($arg:tt)*) => {{
        eprintln!("{}", log_line("INFO", &format!($($arg)*)))
    }};
}

macro_rules! log_warn {
    ($($arg:tt)*) => {{
        eprintln!("{}", log_line("WARN", &format!($($arg)*)))
    }};
}

macro_rules! log_debug {
    ($($arg:tt)*) => {{
        if verbose_enabled() {
            eprintln!("{}", log_line("DEBUG", &format!($($arg)*)))
        }
    }};
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct NotifyPayload {
    /// Caller-supplied message id (dedupe key on the Relix side).
    pub id: String,
    /// Full Relix tab id (`shell:<uuid>`). Matches `_RELIX_TAB_ID`.
    #[serde(rename = "tabId")]
    pub tab_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
}

pub fn validate_payload(value: &serde_json::Value) -> Result<NotifyPayload, String> {
    let payload: NotifyPayload =
        serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
    if payload.id.trim().is_empty() {
        return Err("id must not be empty".to_string());
    }
    if payload.tab_id.trim().is_empty() {
        return Err("tabId must not be empty".to_string());
    }
    if payload.id.len() > 256 {
        return Err("id too long".to_string());
    }
    if payload.tab_id.len() > 256 {
        return Err("tabId too long".to_string());
    }
    Ok(payload)
}

struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn cors_headers() -> &'static str {
    "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
}

fn response(status: &str, content_type: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n{body}",
        body.len(),
        cors_headers(),
    )
}

fn ok_json(body: &str) -> String {
    response("200 OK", "application/json", body)
}

fn accepted() -> String {
    response("202 Accepted", "application/json", r#"{"ok":true}"#)
}

fn bad_request(message: &str) -> String {
    let body = serde_json::json!({"ok": false, "error": message}).to_string();
    response("400 Bad Request", "application/json", &body)
}

fn not_found() -> String {
    response("404 Not Found", "application/json", r#"{"ok":false}"#)
}

fn parse_request(buf: &[u8]) -> Option<(Request, usize)> {
    let header_end = find_subslice(buf, b"\r\n\r\n")?;
    let header_text = std::str::from_utf8(&buf[..header_end]).ok()?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_uppercase();
    let raw_path = parts.next().unwrap_or("/");
    let path = raw_path.split('?').next().unwrap_or("/").to_string();
    let mut headers = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_lowercase(), v.trim().to_string());
        }
    }
    let content_length: usize = headers
        .get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let total = header_end + 4 + content_length;
    if buf.len() < total {
        return None;
    }
    let body = buf[header_end + 4..total].to_vec();
    Some((
        Request {
            method,
            path,
            headers,
            body,
        },
        total,
    ))
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|w| w == needle)
}

async fn handle_connection(
    mut stream: TcpStream,
    peer: String,
    tx: broadcast::Sender<NotifyPayload>,
) -> std::io::Result<()> {
    let mut buf = Vec::with_capacity(8192);
    let mut tmp = [0u8; 4096];
    loop {
        let n = stream.read(&mut tmp).await?;
        if n == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&tmp[..n]);
        // Only single-request-per-connection except SSE; wait until full headers+body.
        if find_subslice(&buf, b"\r\n\r\n").is_none() {
            if buf.len() > 64 * 1024 {
                log_warn!("{peer} oversized headers, closing");
                return Ok(());
            }
            continue;
        }
        let Some((req, _consumed)) = parse_request(&buf) else {
            // Body not fully arrived yet.
            if buf.len() > 256 * 1024 {
                log_warn!("{peer} oversized body, closing");
                return Ok(());
            }
            continue;
        };

        if req.method == "OPTIONS" {
            log_debug!("{peer} OPTIONS {}", req.path);
            let res = format!(
                "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n{}Connection: close\r\n\r\n",
                cors_headers()
            );
            stream.write_all(res.as_bytes()).await?;
            return Ok(());
        }

        match (req.method.as_str(), req.path.as_str()) {
            ("GET", HEALTH_PATH) => {
                log_debug!("{peer} GET /healthz -> 200");
                let res = ok_json(r#"{"ok":true}"#);
                stream.write_all(res.as_bytes()).await?;
                return Ok(());
            }
            ("POST", SEND_PATH) => {
                let value: serde_json::Value = match serde_json::from_slice(&req.body) {
                    Ok(v) => v,
                    Err(e) => {
                        log_warn!("{peer} POST /send-notification invalid JSON: {e}");
                        let res = bad_request(&format!("invalid JSON: {e}"));
                        stream.write_all(res.as_bytes()).await?;
                        return Ok(());
                    }
                };
                match validate_payload(&value) {
                    Ok(payload) => {
                        let receivers = tx.receiver_count();
                        match tx.send(payload.clone()) {
                            Ok(_) => log_info!(
                                "{peer} notify id='{}' tab='{}' -> {} subscriber(s)",
                                payload.id,
                                payload.tab_id,
                                receivers
                            ),
                            Err(_) => log_info!(
                                "{peer} notify id='{}' tab='{}' -> no subscribers, dropped",
                                payload.id,
                                payload.tab_id
                            ),
                        }
                        let res = accepted();
                        stream.write_all(res.as_bytes()).await?;
                    }
                    Err(message) => {
                        log_warn!("{peer} POST /send-notification rejected: {message}");
                        let res = bad_request(&message);
                        stream.write_all(res.as_bytes()).await?;
                    }
                }
                return Ok(());
            }
            ("GET", EVENTS_PATH) => {
                let mut rx = tx.subscribe();
                let subscribers = tx.receiver_count();
                log_info!("{peer} subscriber connected ({subscribers} total)");
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n{}Connection: keep-alive\r\n\r\n:ok\n\n",
                    cors_headers()
                );
                if stream.write_all(head.as_bytes()).await.is_err() {
                    log_info!("{peer} subscriber left (headers unsent)");
                    return Ok(());
                }
                let mut delivered: u64 = 0;
                loop {
                    match rx.recv().await {
                        Ok(payload) => {
                            let json = serde_json::to_string(&payload)
                                .unwrap_or_else(|_| "{}".to_string());
                            let frame = format!("data: {json}\n\n");
                            if stream.write_all(frame.as_bytes()).await.is_err() {
                                log_info!(
                                    "{peer} subscriber left after {delivered} event(s)"
                                );
                                return Ok(());
                            }
                            delivered += 1;
                            log_debug!(
                                "{peer} delivered id='{}' tab='{}'",
                                payload.id,
                                payload.tab_id
                            );
                        }
                        Err(broadcast::error::RecvError::Lagged(skipped)) => {
                            log_warn!("{peer} lagged, skipped {skipped} event(s)");
                            continue;
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            log_info!("{peer} subscriber left (relay closed)");
                            return Ok(());
                        }
                    }
                }
            }
            _ => {
                log_warn!("{} {} {} -> 404", peer, req.method, req.path);
                let res = not_found();
                stream.write_all(res.as_bytes()).await?;
                return Ok(());
            }
        }
    }
}

fn resolve_port() -> u16 {
    std::env::args()
        .skip_while(|a| a != "--port")
        .nth(1)
        .and_then(|v| v.parse().ok())
        .or_else(|| {
            std::env::var("RELIX_NOTIFY_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
        })
        .unwrap_or(DEFAULT_PORT)
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let port = resolve_port();
    let listener = TcpListener::bind(("127.0.0.1", port)).await?;
    log_info!(
        "listening on 127.0.0.1:{port} (pid {}, verbose={})",
        std::process::id(),
        verbose_enabled()
    );
    let (tx, _) = broadcast::channel::<NotifyPayload>(256);
    loop {
        let (stream, addr) = listener.accept().await?;
        let peer = addr.to_string();
        log_debug!("{peer} connected");
        let tx = tx.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_connection(stream, peer.clone(), tx).await {
                log_warn!("{peer} connection error: {e}");
            } else {
                log_debug!("{peer} disconnected");
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_minimal_payload() {
        let v = serde_json::json!({"id": "m1", "tabId": "shell:abc"});
        let p = validate_payload(&v).unwrap();
        assert_eq!(p.id, "m1");
        assert_eq!(p.tab_id, "shell:abc");
        assert_eq!(p.title, None);
    }

    #[test]
    fn accepts_full_payload() {
        let v = serde_json::json!({
            "id": "m1",
            "tabId": "shell:abc",
            "title": "build done",
            "body": "cargo test passed",
        });
        let p = validate_payload(&v).unwrap();
        assert_eq!(p.title.as_deref(), Some("build done"));
    }

    #[test]
    fn rejects_empty_ids() {
        assert!(validate_payload(&serde_json::json!({"id": "", "tabId": "shell:x"})).is_err());
        assert!(validate_payload(&serde_json::json!({"id": "m1", "tabId": ""})).is_err());
        assert!(validate_payload(&serde_json::json!({"id": "m1"})).is_err());
    }

    #[test]
    fn parses_post_with_body() {
        let body = br#"{"id":"m1","tabId":"t"}"#;
        let head = format!(
            "POST /send-notification HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            body.len()
        );
        let mut raw = head.into_bytes();
        raw.extend_from_slice(body);
        raw.extend_from_slice(b"xx");
        let (req, consumed) = parse_request(&raw).unwrap();
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, SEND_PATH);
        assert_eq!(consumed, raw.len() - 2);
        assert!(validate_payload(&serde_json::from_slice::<serde_json::Value>(&req.body).unwrap()).is_ok());
    }

    #[test]
    fn strips_query_from_path() {
        let raw = b"GET /events?tabId=shell%3Aabc HTTP/1.1\r\n\r\n";
        let (req, _) = parse_request(raw).unwrap();
        assert_eq!(req.path, EVENTS_PATH);
    }

    #[test]
    fn log_lines_carry_level_and_message() {
        let line = log_line("INFO", "hello");
        assert!(line.contains("relix-notify INFO: hello"));
    }

    #[test]
    fn responses_carry_cors() {
        assert!(accepted().contains("Access-Control-Allow-Origin: *"));
        assert!(ok_json("{}").contains("Access-Control-Allow-Origin: *"));
    }
}
