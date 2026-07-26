mod ssh;

use ssh::commands::{
    ssh_close_shell, ssh_connect, ssh_disconnect, ssh_open_shell, ssh_resize,
    ssh_start_local_forward, ssh_stop_forward, ssh_trust_host_key, ssh_write,
};
use ssh::manager::SshManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(SshManager::new())
        .invoke_handler(tauri::generate_handler![
            ssh_connect,
            ssh_disconnect,
            ssh_open_shell,
            ssh_close_shell,
            ssh_write,
            ssh_resize,
            ssh_trust_host_key,
            ssh_start_local_forward,
            ssh_stop_forward,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
