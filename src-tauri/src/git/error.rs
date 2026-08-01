use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GitErrorCode {
    NotInstalled,
    TooOld,
    NotConnected,
    Unavailable,
    NotADirectory,
    InvalidPath,
    FileTooLarge,
    NoUpstream,
    AuthRequired,
    TimedOut,
    EmptyCommitMessage,
    CommandFailed,
    SpawnFailed,
    Internal,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitError {
    pub code: GitErrorCode,
    pub message: String,
}

impl GitError {
    pub fn new(code: GitErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn command(context: &'static str, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        let message = if detail.is_empty() {
            context.to_string()
        } else {
            format!("{context}: {detail}")
        };
        Self::new(GitErrorCode::CommandFailed, message)
    }
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for GitError {}

pub type Result<T> = std::result::Result<T, GitError>;
