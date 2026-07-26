mod ssh;

use ssh::commands::{ssh_connect, ssh_disconnect, ssh_trust_host_key};
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
            ssh_trust_host_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
