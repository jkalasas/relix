mod ssh;

use ssh::commands::{
    ssh_cancel_connect, ssh_close_shell, ssh_connect, ssh_disconnect, ssh_open_shell, ssh_resize,
    ssh_sftp_list, ssh_sftp_mkdir, ssh_sftp_read, ssh_sftp_remove, ssh_sftp_rename, ssh_sftp_write,
    ssh_start_dynamic_forward, ssh_start_local_forward, ssh_start_remote_forward, ssh_stop_forward,
    ssh_tmux_bootstrap, ssh_tmux_kill_session, ssh_tmux_kill_window, ssh_tmux_list_windows,
    ssh_tmux_new_window, ssh_tmux_window_path, ssh_trust_host_key, ssh_write,
};
use ssh::manager::SshManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SshManager::new())
        .invoke_handler(tauri::generate_handler![
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
            ssh_sftp_list,
            ssh_sftp_read,
            ssh_sftp_write,
            ssh_sftp_mkdir,
            ssh_sftp_remove,
            ssh_sftp_rename,
            ssh_tmux_bootstrap,
            ssh_tmux_new_window,
            ssh_tmux_list_windows,
            ssh_tmux_kill_window,
            ssh_tmux_kill_session,
            ssh_tmux_window_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
