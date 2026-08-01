use crate::git::error::{GitError, GitErrorCode, Result};

pub fn validate_repo_rel_path(path: &str) -> Result<String> {
    let path = path.trim();
    if path.is_empty() || path.contains('\0') {
        return Err(GitError::new(GitErrorCode::InvalidPath, "invalid path"));
    }
    let normalized = path.replace('\\', "/");
    if normalized.starts_with('/') || normalized.starts_with("~/") {
        return Err(GitError::new(
            GitErrorCode::InvalidPath,
            "path must be relative to repo root",
        ));
    }
    // Windows drive
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        return Err(GitError::new(
            GitErrorCode::InvalidPath,
            "path must be relative to repo root",
        ));
    }
    for seg in normalized.split('/') {
        if seg == ".." {
            return Err(GitError::new(
                GitErrorCode::InvalidPath,
                "path must not contain ..",
            ));
        }
    }
    Ok(normalized)
}

pub fn validate_branch_name(name: &str) -> Result<()> {
    let name = name.trim();
    if name.is_empty() || name.starts_with('-') || name.contains('\0') {
        return Err(GitError::new(
            GitErrorCode::InvalidPath,
            format!("invalid branch name: {name}"),
        ));
    }
    Ok(())
}

pub fn sha_is_safe(sha: &str) -> bool {
    !sha.is_empty() && sha.len() <= 64 && sha.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn validate_local_dir(path: &str) -> Result<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(GitError::new(
            GitErrorCode::NotADirectory,
            "path is empty",
        ));
    }
    let meta = std::fs::metadata(trimmed).map_err(|_| {
        GitError::new(
            GitErrorCode::NotADirectory,
            format!("not a directory: {trimmed}"),
        )
    })?;
    if !meta.is_dir() {
        return Err(GitError::new(
            GitErrorCode::NotADirectory,
            format!("not a directory: {trimmed}"),
        ));
    }
    let canonical = std::fs::canonicalize(trimmed).map_err(|e| {
        GitError::new(GitErrorCode::InvalidPath, e.to_string())
    })?;
    Ok(canonical.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_simple_relative() {
        assert_eq!(validate_repo_rel_path("src/a.rs").unwrap(), "src/a.rs");
    }

    #[test]
    fn rejects_absolute_unix() {
        assert!(validate_repo_rel_path("/etc/passwd").is_err());
    }

    #[test]
    fn rejects_dotdot() {
        assert!(validate_repo_rel_path("foo/../bar").is_err());
    }

    #[test]
    fn rejects_empty_and_nul() {
        assert!(validate_repo_rel_path("").is_err());
        assert!(validate_repo_rel_path("a\0b").is_err());
    }

    #[test]
    fn normalizes_backslashes() {
        assert_eq!(validate_repo_rel_path(r"src\a.rs").unwrap(), "src/a.rs");
    }

    #[test]
    fn branch_name_rules() {
        assert!(validate_branch_name("main").is_ok());
        assert!(validate_branch_name("feat/x").is_ok());
        assert!(validate_branch_name("").is_err());
        assert!(validate_branch_name("-bad").is_err());
    }

    #[test]
    fn sha_rules() {
        assert!(sha_is_safe("abc123f"));
        assert!(!sha_is_safe(""));
        assert!(!sha_is_safe("../x"));
        assert!(!sha_is_safe(&"a".repeat(65)));
    }

    #[test]
    fn local_dir_rejects_empty() {
        assert!(validate_local_dir("").is_err());
        assert!(validate_local_dir("   ").is_err());
    }

    #[test]
    fn local_dir_rejects_missing() {
        let missing = std::env::temp_dir().join("relix_validate_local_dir_missing_path");
        let _ = std::fs::remove_dir_all(&missing);
        assert!(validate_local_dir(missing.to_str().unwrap()).is_err());
    }

    #[test]
    fn local_dir_rejects_file() {
        let file = std::env::temp_dir().join("relix_validate_local_dir_file");
        std::fs::write(&file, b"x").unwrap();
        let result = validate_local_dir(file.to_str().unwrap());
        let _ = std::fs::remove_file(&file);
        assert!(result.is_err());
    }

    #[test]
    fn local_dir_accepts_dir() {
        let dir = std::env::temp_dir().join("relix_validate_local_dir_ok");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let result = validate_local_dir(dir.to_str().unwrap());
        let _ = std::fs::remove_dir_all(&dir);
        let canonical = result.unwrap();
        assert!(!canonical.is_empty());
        assert!(!canonical.contains('\\'));
    }
}
