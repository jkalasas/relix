use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SshErrorCode {
    HostKeyUnknown,
    HostKeyChanged,
    AuthFailed,
    ConnectFailed,
    KeyUnreadable,
    InvalidKey,
    NotConnected,
    BindFailed,
    ForwardFailed,
    NotFound,
    Internal,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshError {
    pub code: SshErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub algorithm: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_base64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
}

impl SshError {
    pub fn new(code: SshErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            hostname: None,
            port: None,
            algorithm: None,
            key_base64: None,
            fingerprint: None,
        }
    }

    pub fn with_host_key(
        mut self,
        hostname: impl Into<String>,
        port: u16,
        algorithm: impl Into<String>,
        key_base64: impl Into<String>,
        fingerprint: impl Into<String>,
    ) -> Self {
        self.hostname = Some(hostname.into());
        self.port = Some(port);
        self.algorithm = Some(algorithm.into());
        self.key_base64 = Some(key_base64.into());
        self.fingerprint = Some(fingerprint.into());
        self
    }
}

impl std::fmt::Display for SshError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for SshError {}

// Tauri 2 converts `Result<T, E>` errors via `impl<T: Serialize> From<T> for InvokeError`,
// which does `serde_json::to_value`. So `Result<T, SshError>` round-trips as a structured
// JSON object to the frontend (not just Display/message). Keep returning SshError directly.
