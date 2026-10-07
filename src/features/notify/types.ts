export type NotifyPayload = {
  /** Caller-supplied dedupe key. */
  id: string;
  /** Full Relix tab id (`shell:<uuid>`). Matches `_RELIX_TAB_ID`. */
  tabId: string;
  title?: string;
  body?: string;
};
