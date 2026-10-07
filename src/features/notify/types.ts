export type NotifyPayload = {
  /** Caller-supplied dedupe key. */
  id: string;
  /** Full Relix tab id (`shell:<uuid>`). Matches `_RELIX_TAB_ID`. */
  tabId: string;
  title?: string;
  body?: string;
};

export type NotificationEntry = {
  /** Latest payload id for this tab (replaced on each new notify). */
  id: string;
  /** Full Relix tab id (`shell:<uuid>`). One entry per tab. */
  tabId: string;
  title: string;
  body: string;
  /** Host whose relay delivered the payload. */
  hostId: string;
  /** Resolved at arrival; null when the tab is not open (yet). */
  workspaceId: string | null;
  receivedAt: number;
};
