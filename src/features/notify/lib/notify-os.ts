type NotificationModule = typeof import("@tauri-apps/plugin-notification");

/** Action type id for relix-notify taps. Mobile only — desktop ignores it. */
export const NOTIFY_ACTION_TYPE_ID = "relix-notify";

/**
 * Android notification channel. Android 8+ drops notifications whose
 * channel does not exist, so this must be created before sending.
 * Channels are Android-only — desktop ignores the channelId.
 */
export const NOTIFY_CHANNEL_ID = "relix-notify";

/**
 * Non-negative 31-bit hash so re-notifies for one tab replace the
 * previous OS card. Masked (not Math.abs) so -2^31 stays in range.
 */
export function notificationIdForTab(tabId: string): number {
  let hash = 0;
  for (let i = 0; i < tabId.length; i += 1) {
    hash = (hash * 31 + tabId.charCodeAt(i)) | 0;
  }
  return hash & 0x7fffffff;
}

async function loadNotificationModule(): Promise<NotificationModule | null> {
  try {
    return (await import(
      "@tauri-apps/plugin-notification"
    )) as NotificationModule;
  } catch {
    return null;
  }
}

let channelPromise: Promise<void> | null = null;

/**
 * Creates the Android channel once. No-op on desktop (rejected there).
 */
function ensureNotifyChannel(mod: NotificationModule): Promise<void> {
  if (typeof mod.createChannel !== "function") return Promise.resolve();
  if (!channelPromise) {
    channelPromise = (async () => {
      try {
        await mod.createChannel({
          id: NOTIFY_CHANNEL_ID,
          name: "Host notifications",
          description: "Pages from host processes via relix-notify",
          importance: mod.Importance?.Default ?? 3,
        });
      } catch {
        channelPromise = null;
      }
    })();
  }
  return channelPromise;
}

/**
 * Best-effort OS notification carrying the tab id in `extra` so a mobile
 * tap can route back. Resolves to false when the plugin is unavailable.
 */
export async function sendOsNotification(input: {
  title: string;
  body?: string;
  tabId?: string;
}): Promise<boolean> {
  try {
    const mod = await loadNotificationModule();
    if (!mod) return false;
    if (typeof mod.isPermissionGranted === "function") {
      const granted = await mod.isPermissionGranted();
      if (!granted) {
        const next = await mod.requestPermission();
        if (next !== "granted") return false;
      }
    }
    await ensureNotifyChannel(mod);
    mod.sendNotification({
      title: input.title,
      body: input.body,
      channelId: NOTIFY_CHANNEL_ID,
      ...(input.tabId
        ? {
            id: notificationIdForTab(input.tabId),
            actionTypeId: NOTIFY_ACTION_TYPE_ID,
            extra: { tabId: input.tabId },
          }
        : {}),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers the tap action type and routes mobile OS notification taps to
 * `onOpenTab`. Desktop never fires — the call is a silent no-op there.
 */
export async function listenOsNotificationTap(
  onOpenTab: (tabId: string) => void,
): Promise<() => void> {
  const noop = () => {};
  try {
    const mod = await loadNotificationModule();
    if (!mod) return noop;
    if (typeof mod.registerActionTypes === "function") {
      try {
        await mod.registerActionTypes([
          {
            id: NOTIFY_ACTION_TYPE_ID,
            actions: [{ id: "open", title: "Open", foreground: true }],
          },
        ]);
      } catch {
        // desktop or older runtime — taps simply never arrive
      }
    }
    if (typeof mod.onAction !== "function") return noop;
    const listener = await mod.onAction((event: unknown) => {
      const tabId = readTapTabId(event);
      if (tabId) onOpenTab(tabId);
    });
    return () => {
      try {
        void Promise.resolve(listener?.unregister()).catch(() => {});
      } catch {
        // already unlistened
      }
    };
  } catch {
    return noop;
  }
}

function readTapTabId(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const record = event as Record<string, unknown>;
  const extra =
    (record.extra as Record<string, unknown> | undefined) ??
    (
      (record.notification as Record<string, unknown> | undefined)?.extra as
        | Record<string, unknown>
        | undefined
    );
  const tabId = extra?.tabId;
  return typeof tabId === "string" && tabId ? tabId : null;
}
