mod ssh;
pub mod git;

#[cfg(desktop)]
mod tray;

use git::commands::{
    git_add_worktree, git_checkout_branch, git_commit, git_commit_file_diff, git_commit_files,
    git_create_branch, git_diff, git_diff_content, git_discard, git_fetch, git_list_branches,
    git_list_worktrees, git_log, git_panel_snapshot, git_pull_ff_only, git_push, git_remote_url,
    git_remove_worktree, git_resolve_repo, git_show_commit, git_stage, git_status, git_unstage,
};
use ssh::commands::{
    host_fs_list, host_fs_mkdir, host_fs_read, host_fs_remove, host_fs_rename, host_fs_write,
    local_shell_available, ssh_cancel_connect, ssh_close_shell, ssh_connect, ssh_disconnect,
    ssh_open_shell, ssh_resize, ssh_start_dynamic_forward, ssh_start_local_forward,
    ssh_start_remote_forward, ssh_stop_forward, ssh_tmux_bootstrap, ssh_tmux_kill_session,
    ssh_tmux_kill_window, ssh_tmux_list_windows, ssh_tmux_new_window, ssh_tmux_window_path,
    ssh_trust_host_key, ssh_write,
};
use ssh::manager::SshManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_android_battery_optimization::init())
        .plugin(tauri_plugin_relix_keepalive::init())
        .manage(SshManager::new())
        .setup(|app| {
            #[cfg(desktop)]
            tray::setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            local_shell_available,
            ssh_connect,
            ssh_disconnect,
            ssh_cancel_connect,
            ssh_open_shell,
            ssh_close_shell,
            ssh_write,
            ssh_resize,
            ssh_trust_host_key,
            ssh_start_local_forward,
            ssh_start_remote_forward,
            ssh_start_dynamic_forward,
            ssh_stop_forward,
            host_fs_list,
            host_fs_read,
            host_fs_write,
            host_fs_mkdir,
            host_fs_remove,
            host_fs_rename,
            ssh_tmux_bootstrap,
            ssh_tmux_new_window,
            ssh_tmux_list_windows,
            ssh_tmux_kill_window,
            ssh_tmux_kill_session,
            ssh_tmux_window_path,
            git_resolve_repo,
            git_panel_snapshot,
            git_status,
            git_diff,
            git_diff_content,
            git_stage,
            git_unstage,
            git_discard,
            git_commit,
            git_fetch,
            git_pull_ff_only,
            git_push,
            git_log,
            git_show_commit,
            git_commit_files,
            git_commit_file_diff,
            git_list_branches,
            git_list_worktrees,
            git_add_worktree,
            git_remove_worktree,
            git_checkout_branch,
            git_create_branch,
            git_remote_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

