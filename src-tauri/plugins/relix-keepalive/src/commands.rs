use tauri::{command, AppHandle, Runtime};

#[cfg(target_os = "android")]
use tauri::Manager;
#[cfg(target_os = "android")]
use crate::KeepaliveHandle;
use crate::{Error, NotificationPermissionStatus, StartKeepaliveArgs};

#[command]
pub async fn start_keepalive<R: Runtime>(
    app: AppHandle<R>,
    args: StartKeepaliveArgs,
) -> Result<(), Error> {
    #[cfg(target_os = "android")]
    {
        app.state::<KeepaliveHandle<R>>().start(args)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, args);
        Ok(())
    }
}

#[command]
pub async fn stop_keepalive<R: Runtime>(app: AppHandle<R>) -> Result<(), Error> {
    #[cfg(target_os = "android")]
    {
        app.state::<KeepaliveHandle<R>>().stop()
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[command]
pub async fn is_keepalive_running<R: Runtime>(app: AppHandle<R>) -> Result<bool, Error> {
    #[cfg(target_os = "android")]
    {
        app.state::<KeepaliveHandle<R>>().is_running()
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}

#[command]
pub async fn get_notification_permission_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<NotificationPermissionStatus, Error> {
    #[cfg(target_os = "android")]
    {
        app.state::<KeepaliveHandle<R>>()
            .notification_permission_status()
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(NotificationPermissionStatus {
            status: "granted".into(),
        })
    }
}

#[command]
pub async fn request_notification_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<NotificationPermissionStatus, Error> {
    #[cfg(target_os = "android")]
    {
        app.state::<KeepaliveHandle<R>>()
            .request_notification_permission()
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(NotificationPermissionStatus {
            status: "granted".into(),
        })
    }
}

