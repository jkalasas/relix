type IsViewedInput = {
  tabId: string;
  workspaceId: string | null;
  activeWorkspaceId: string | null;
  activeTabId: string | null;
  windowVisible: boolean;
};

/**
 * Returns true when an incoming notification targets the tab the user is
 * already looking at. Callers skip every signal (in-app toast, OS banner,
 * bell entry, tab dot) in that case.
 */
export function isViewedNotification(input: IsViewedInput): boolean {
  if (!input.windowVisible) return false;
  if (!input.workspaceId || !input.activeWorkspaceId) return false;
  if (input.workspaceId !== input.activeWorkspaceId) return false;
  if (!input.activeTabId) return false;
  return input.tabId === input.activeTabId;
}

/**
 * Reads whether the app window is currently visible and focused. True on
 * the server or when the document API is unavailable so callers notify.
 */
export function isAppWindowVisible(): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible") return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }
  return true;
}
