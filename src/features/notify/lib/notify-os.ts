/**
 * Best-effort OS notification. Resolves to false when the
 * `tauri-plugin-notification` frontend package is unavailable (e.g. tests).
 */
export async function sendOsNotification(input: {
  title: string;
  body?: string;
}): Promise<boolean> {
  try {
    const mod = (await import(
      "@tauri-apps/plugin-notification"
    )) as typeof import("@tauri-apps/plugin-notification");
    if (typeof mod.isPermissionGranted === "function") {
      const granted = await mod.isPermissionGranted();
      if (!granted) {
        const next = await mod.requestPermission();
        if (next !== "granted") return false;
      }
    }
    mod.sendNotification({ title: input.title, body: input.body });
    return true;
  } catch {
    return false;
  }
}
