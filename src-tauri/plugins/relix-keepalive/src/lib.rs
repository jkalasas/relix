use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "android")]
use tauri::Manager;

mod commands;
mod error;

pub use error::Error;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartKeepaliveArgs {
    #[serde(default = "default_label")]
    pub label: String,
}

fn default_label() -> String {
    "Relix is running · sessions active".into()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPermissionStatus {
    pub status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningPayload {
    pub running: bool,
}

pub struct KeepaliveHandle<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> KeepaliveHandle<R> {
    #[cfg(target_os = "android")]
    pub fn start(&self, args: StartKeepaliveArgs) -> Result<(), Error> {
        self.0
            .run_mobile_plugin("startKeepalive", args)
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(target_os = "android")]
    pub fn stop(&self) -> Result<(), Error> {
        self.0
            .run_mobile_plugin("stopKeepalive", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(target_os = "android")]
    pub fn is_running(&self) -> Result<bool, Error> {
        let payload: RunningPayload = self
            .0
            .run_mobile_plugin("isKeepaliveRunning", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))?;
        Ok(payload.running)
    }

    #[cfg(target_os = "android")]
    pub fn notification_permission_status(&self) -> Result<NotificationPermissionStatus, Error> {
        self.0
            .run_mobile_plugin("getNotificationPermissionStatus", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(target_os = "android")]
    pub fn request_notification_permission(&self) -> Result<NotificationPermissionStatus, Error> {
        self.0
            .run_mobile_plugin("requestNotificationPermission", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("relix-keepalive")
        .invoke_handler(tauri::generate_handler![
            commands::start_keepalive,
            commands::stop_keepalive,
            commands::is_keepalive_running,
            commands::get_notification_permission_status,
            commands::request_notification_permission,
        ])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin("com.relix.keepalive", "KeepalivePlugin")?;
                app.manage(KeepaliveHandle(handle));
            }
            let _ = (app, api);
            Ok(())
        })
        .build()
}
