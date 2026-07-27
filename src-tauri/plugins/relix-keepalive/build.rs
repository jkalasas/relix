const COMMANDS: &[&str] = &[
    "start_keepalive",
    "stop_keepalive",
    "is_keepalive_running",
    "get_notification_permission_status",
    "request_notification_permission",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
