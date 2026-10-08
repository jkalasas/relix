use std::path::PathBuf;

/// Largest file list accepted from the OS clipboard.
const MAX_CLIPBOARD_FILES: usize = 32;

/**
 * Read file paths copied in Explorer/Finder from the OS clipboard.
 *
 * The webview cannot see OS file copies on paste, so the terminal falls
 * back to this command when `clipboardData.files` is empty. Returns an
 * empty list when the clipboard holds no files instead of an error so
 * normal text paste falls through cleanly.
 */
#[cfg(desktop)]
#[tauri::command]
pub async fn clipboard_file_paths() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(read_clipboard_files_blocking)
        .await
        .map_err(|err| err.to_string())?
}

/**
 * Mobile stub keeps the frontend calling one command on every platform.
 */
#[cfg(not(desktop))]
#[tauri::command]
pub async fn clipboard_file_paths() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

/**
 * Blocking clipboard read run off the async runtime.
 */
#[cfg(desktop)]
fn read_clipboard_files_blocking() -> Result<Vec<String>, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|err| err.to_string())?;
    let files = match clipboard.get().file_list() {
        Ok(files) => files,
        Err(arboard::Error::ContentNotAvailable) => return Ok(Vec::new()),
        Err(err) => return Err(err.to_string()),
    };
    Ok(normalize_file_list(files))
}

/**
 * Keep existing absolute paths, capped so a huge multi-select cannot
 * flood the staging pipeline.
 */
#[cfg(desktop)]
fn normalize_file_list(files: Vec<PathBuf>) -> Vec<String> {
    let mut out = Vec::new();
    for path in files {
        if out.len() >= MAX_CLIPBOARD_FILES {
            break;
        }
        if !path.is_absolute() {
            continue;
        }
        if !path.exists() {
            continue;
        }
        out.push(path.to_string_lossy().into_owned());
    }
    out
}

#[cfg(all(test, desktop))]
mod tests {
    use std::path::PathBuf;

    use super::normalize_file_list;

    #[test]
    fn drops_relative_and_missing_paths() {
        let dir = tempfile::tempdir().expect("tempdir");
        let real = dir.path().join("a.txt");
        std::fs::write(&real, b"x").expect("write");
        let out = normalize_file_list(vec![
            real,
            PathBuf::from("relative.txt"),
            PathBuf::from("/definitely/missing/relix-clipboard-test.txt"),
        ]);
        assert_eq!(out.len(), 1);
        assert!(out[0].ends_with("a.txt"));
    }
}
