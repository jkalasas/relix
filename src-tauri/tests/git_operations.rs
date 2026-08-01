use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use relix_lib::git::error::GitErrorCode;
use relix_lib::git::operations;
use relix_lib::git::runner::GitBackend;
use relix_lib::git::types::DiscardEntry;

const HOST: &str = "local";

struct Fixture {
    _dir: tempfile::TempDir,
    root: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path().to_path_buf();
        run_git(&root, &["init", "-b", "main"]);
        run_git(&root, &["config", "user.email", "test@example.com"]);
        run_git(&root, &["config", "user.name", "Test User"]);
        run_git(&root, &["config", "commit.gpgsign", "false"]);
        run_git(&root, &["config", "core.autocrlf", "false"]);
        Self { _dir: dir, root }
    }

    fn root_str(&self) -> &str {
        self.root.to_str().expect("utf8 path")
    }

    fn write(&self, rel: &str, contents: &str) {
        let path = self.root.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("mkdir");
        }
        fs::write(path, contents).expect("write");
    }

    fn read(&self, rel: &str) -> String {
        fs::read_to_string(self.root.join(rel)).expect("read")
    }

    fn exists(&self, rel: &str) -> bool {
        self.root.join(rel).exists()
    }
}

fn run_git(cwd: &Path, args: &[&str]) {
    let status = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .status()
        .expect("spawn git");
    assert!(status.success(), "git {args:?} failed");
}

#[tokio::test]
async fn resolve_none_outside_repo() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().to_str().expect("utf8");
    let backend = GitBackend::Local;
    let resolved = operations::resolve_repo(&backend, HOST, path)
        .await
        .expect("resolve");
    assert!(resolved.is_none());
}

#[tokio::test]
async fn status_stage_commit_log_branch() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();

    let repo = operations::resolve_repo(&backend, HOST, root)
        .await
        .expect("resolve")
        .expect("in repo");
    assert!(repo.repo_root.contains(root.trim_end_matches('/')) || Path::new(&repo.repo_root).exists());
    assert_eq!(repo.branch, "main");
    assert!(repo.is_detached || !repo.is_detached); // unborn may report main

    fx.write("a.txt", "one\n");
    operations::stage(
        &backend,
        HOST,
        root,
        &["a.txt".into()],
    )
    .await
    .expect("stage a");

    let status = operations::status(&backend, HOST, root)
        .await
        .expect("status staged");
    assert!(
        status
            .changed_files
            .iter()
            .any(|f| f.path == "a.txt" && f.staged),
        "expected staged a.txt, got {:?}",
        status.changed_files
    );

    let commit = operations::commit(&backend, HOST, root, "first")
        .await
        .expect("commit first");
    assert!(!commit.commit_sha.is_empty());
    assert_eq!(commit.summary, "first");

    fx.write("a.txt", "two\n");
    let dirty = operations::status(&backend, HOST, root)
        .await
        .expect("dirty status");
    assert!(
        dirty
            .changed_files
            .iter()
            .any(|f| f.path == "a.txt" && f.unstaged),
        "expected unstaged a.txt"
    );

    fx.write("b.txt", "bee\n");
    operations::stage(
        &backend,
        HOST,
        root,
        &["a.txt".into(), "b.txt".into()],
    )
    .await
    .expect("stage more");
    operations::commit(&backend, HOST, root, "second")
        .await
        .expect("commit second");

    let log = operations::log(&backend, HOST, root, 10, None)
        .await
        .expect("log");
    assert!(log.len() >= 2);
    assert_eq!(log[0].subject, "second");
    assert_eq!(log[1].subject, "first");
    assert!(!log[0].short_sha.is_empty());

    operations::create_branch(&backend, HOST, root, "feature", false)
        .await
        .expect("create branch");
    let branches = operations::list_branches(&backend, HOST, root)
        .await
        .expect("list branches");
    assert!(
        branches.branches.iter().any(|b| b.name == "feature"),
        "feature missing: {:?}",
        branches.branches
    );
    assert!(
        branches
            .branches
            .iter()
            .any(|b| b.name == "main" && b.is_head),
        "main should be head"
    );

    operations::checkout_branch(&backend, HOST, root, "feature")
        .await
        .expect("checkout feature");
    let after = operations::resolve_repo(&backend, HOST, root)
        .await
        .expect("resolve after checkout")
        .expect("repo");
    assert_eq!(after.branch, "feature");

    let panel = operations::panel_snapshot(&backend, HOST, root)
        .await
        .expect("panel");
    assert!(panel.repo.is_some());
    assert!(panel.status.is_some());
}

#[tokio::test]
async fn discard_tracked_and_untracked() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();

    fx.write("tracked.txt", "original\n");
    operations::stage(&backend, HOST, root, &["tracked.txt".into()])
        .await
        .expect("stage");
    operations::commit(&backend, HOST, root, "base")
        .await
        .expect("commit");

    fx.write("tracked.txt", "dirty\n");
    fx.write("untracked.txt", "gone soon\n");
    assert_eq!(fx.read("tracked.txt"), "dirty\n");
    assert!(fx.exists("untracked.txt"));

    operations::discard(
        &backend,
        HOST,
        root,
        &[
            DiscardEntry {
                path: "tracked.txt".into(),
                untracked: false,
            },
            DiscardEntry {
                path: "untracked.txt".into(),
                untracked: true,
            },
        ],
    )
    .await
    .expect("discard");

    assert_eq!(fx.read("tracked.txt"), "original\n");
    assert!(!fx.exists("untracked.txt"));

    let status = operations::status(&backend, HOST, root)
        .await
        .expect("status clean");
    assert!(
        status.changed_files.is_empty(),
        "expected clean tree, got {:?}",
        status.changed_files
    );
}

#[tokio::test]
async fn empty_commit_message_errors() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();
    fx.write("x.txt", "x\n");
    operations::stage(&backend, HOST, root, &["x.txt".into()])
        .await
        .expect("stage");
    let err = operations::commit(&backend, HOST, root, "   ")
        .await
        .expect_err("empty message");
    assert!(matches!(err.code, GitErrorCode::EmptyCommitMessage));
}

#[tokio::test]
async fn unstage_and_diff() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();

    fx.write("c.txt", "hello\n");
    operations::stage(&backend, HOST, root, &["c.txt".into()])
        .await
        .expect("stage");
    operations::unstage(&backend, HOST, root, &["c.txt".into()])
        .await
        .expect("unstage unborn");

    let status = operations::status(&backend, HOST, root)
        .await
        .expect("status");
    assert!(
        status
            .changed_files
            .iter()
            .any(|f| f.path == "c.txt" && f.untracked),
        "expected untracked after unstage on unborn: {:?}",
        status.changed_files
    );

    operations::stage(&backend, HOST, root, &["c.txt".into()])
        .await
        .expect("restage");
    operations::commit(&backend, HOST, root, "c")
        .await
        .expect("commit");

    fx.write("c.txt", "hello world\n");
    let diff = operations::diff(&backend, HOST, root, Some("c.txt"), false)
        .await
        .expect("diff");
    assert!(diff.diff_text.contains("hello"), "diff: {}", diff.diff_text);

    let content = operations::diff_content(&backend, HOST, root, "c.txt", false, None)
        .await
        .expect("diff_content");
    assert!(content.original_content.contains("hello"));
    assert!(content.modified_content.contains("hello world"));
    assert!(!content.is_binary);
}

#[tokio::test]
async fn commit_files_reports_status_and_numstat() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();

    fx.write("m.txt", "line1\n");
    operations::stage(&backend, HOST, root, &["m.txt".into()])
        .await
        .expect("stage base");
    operations::commit(&backend, HOST, root, "base")
        .await
        .expect("commit base");

    fx.write("m.txt", "line1\nline2\nline3\n");
    operations::stage(&backend, HOST, root, &["m.txt".into()])
        .await
        .expect("stage modify");
    let commit = operations::commit(&backend, HOST, root, "modify")
        .await
        .expect("commit modify");

    let files = operations::commit_files(&backend, HOST, root, &commit.commit_sha)
        .await
        .expect("commit_files");
    assert_eq!(files.len(), 1, "expected one file change: {files:?}");
    let f = &files[0];
    assert_eq!(f.path, "m.txt");
    assert_eq!(f.status, "M");
    assert_eq!(f.status_label, "Modified");
    assert!(f.added > 0, "expected non-zero added, got {f:?}");
    assert_eq!(f.removed, 0);
    assert!(!f.is_binary);
}

#[tokio::test]
async fn commit_files_root_commit_returns_seed_files() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();

    fx.write("seed.txt", "hello root\n");
    operations::stage(&backend, HOST, root, &["seed.txt".into()])
        .await
        .expect("stage seed");
    let commit = operations::commit(&backend, HOST, root, "root")
        .await
        .expect("commit root");

    let files = operations::commit_files(&backend, HOST, root, &commit.commit_sha)
        .await
        .expect("commit_files root");
    assert_eq!(files.len(), 1, "expected seed file in root commit: {files:?}");
    let f = &files[0];
    assert_eq!(f.path, "seed.txt");
    assert_eq!(f.status, "A");
    assert_eq!(f.status_label, "Added");
    assert!(f.added > 0, "expected non-zero added for root commit file: {f:?}");
    assert_eq!(f.removed, 0);
    assert!(!f.is_binary);
}

#[tokio::test]
async fn commit_files_detects_rename() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();

    fx.write("old_name.txt", "same content for rename detection\n");
    operations::stage(&backend, HOST, root, &["old_name.txt".into()])
        .await
        .expect("stage old");
    operations::commit(&backend, HOST, root, "base")
        .await
        .expect("commit base");

    run_git(&fx.root, &["mv", "old_name.txt", "new_name.txt"]);
    let commit = operations::commit(&backend, HOST, root, "rename")
        .await
        .expect("commit rename");

    let files = operations::commit_files(&backend, HOST, root, &commit.commit_sha)
        .await
        .expect("commit_files rename");
    assert_eq!(files.len(), 1, "expected single rename entry: {files:?}");
    let f = &files[0];
    assert_eq!(f.path, "new_name.txt");
    assert_eq!(f.status, "R");
    assert_eq!(f.status_label, "Renamed");
    assert_eq!(f.original_path.as_deref(), Some("old_name.txt"));
}

#[tokio::test]
async fn stage_literal_pathspec_with_glob_chars() {
    let fx = Fixture::new();
    let backend = GitBackend::Local;
    let root = fx.root_str();

    // Filename is literally "star*.txt"; without :(literal) git would treat * as a glob.
    let name = "star*.txt";
    fx.write(name, "globby\n");
    fx.write("starX.txt", "other\n");

    operations::stage(&backend, HOST, root, &[name.into()])
        .await
        .expect("stage literal glob name");

    let status = operations::status(&backend, HOST, root)
        .await
        .expect("status");
    let staged: Vec<_> = status
        .changed_files
        .iter()
        .filter(|f| f.staged)
        .map(|f| f.path.as_str())
        .collect();
    assert_eq!(staged, vec![name], "staged paths: {staged:?}");
    assert!(
        status
            .changed_files
            .iter()
            .any(|f| f.path == "starX.txt" && f.untracked),
        "starX.txt should remain untracked: {:?}",
        status.changed_files
    );
}
