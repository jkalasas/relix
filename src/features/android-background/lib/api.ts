import { invoke } from "@tauri-apps/api/core";
import { addPluginListener, type PluginListener } from "@tauri-apps/api/core";
import {
  checkBatteryOptimizationStatus,
  openBatterySettings,
  requestBatteryOptimizationExemption,
} from "tauri-plugin-android-battery-optimization-api";
import type { BackgroundReadiness } from "@/features/android-background/types";

export const KEEPALIVE_LABEL = "Relix is running · sessions active";

function isNotificationsGranted(value: unknown): boolean {
  if (value === "granted") return true;
  if (
    value &&
    typeof value === "object" &&
    "status" in value &&
    (value as { status: unknown }).status === "granted"
  ) {
    return true;
  }
  return false;
}

export async function isAndroidPlatform(): Promise<boolean> {
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)) {
    return true;
  }
  try {
    await invoke("plugin:relix-keepalive|is_keepalive_running");
    return true;
  } catch {
    return false;
  }
}

export async function getBackgroundReadiness(): Promise<BackgroundReadiness> {
  const isAndroid = await isAndroidPlatform();
  if (!isAndroid) {
    return {
      isAndroid: false,
      ready: true,
      notificationsGranted: true,
      batteryUnrestricted: true,
    };
  }

  let notificationsGranted = false;
  let batteryUnrestricted = false;

  try {
    const status = await invoke<unknown>(
      "plugin:relix-keepalive|get_notification_permission_status",
    );
    notificationsGranted = isNotificationsGranted(status);
  } catch {
    notificationsGranted = false;
  }

  try {
    const battery = await checkBatteryOptimizationStatus();
    batteryUnrestricted = battery.isIgnoringOptimizations;
  } catch {
    batteryUnrestricted = false;
  }

  return {
    isAndroid: true,
    ready: notificationsGranted && batteryUnrestricted,
    notificationsGranted,
    batteryUnrestricted,
  };
}

export async function requestNotifications(): Promise<boolean> {
  try {
    const requested = await invoke<unknown>(
      "plugin:relix-keepalive|request_notification_permission",
    );
    if (isNotificationsGranted(requested)) return true;
    const status = await invoke<unknown>(
      "plugin:relix-keepalive|get_notification_permission_status",
    );
    return isNotificationsGranted(status);
  } catch {
    return false;
  }
}

export async function requestBatteryUnrestricted(): Promise<void> {
  await requestBatteryOptimizationExemption();
}

export async function openSystemBatterySettings(): Promise<void> {
  await openBatterySettings();
}

export async function startKeepalive(): Promise<void> {
  await invoke("plugin:relix-keepalive|start_keepalive", {
    args: { label: KEEPALIVE_LABEL },
  });
}

export async function stopKeepalive(): Promise<void> {
  try {
    await invoke("plugin:relix-keepalive|stop_keepalive");
  } catch {
    // already stopped
  }
}

export async function keepaliveRunning(): Promise<boolean> {
  try {
    return await invoke<boolean>("plugin:relix-keepalive|is_keepalive_running");
  } catch {
    return false;
  }
}

export async function listenKeepaliveStopped(
  onStopped: (reason: string) => void,
): Promise<() => void> {
  let listener: PluginListener | null = null;
  try {
    listener = await addPluginListener("relix-keepalive", "killed", () => {
      onStopped("nativeNotificationStop");
    });
  } catch {
    return () => undefined;
  }

  return () => {
    void listener?.unregister();
  };
}
