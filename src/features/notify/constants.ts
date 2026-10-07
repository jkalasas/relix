/** Fixed loopback port of the host-side `relix-notify` relay. */
export const NOTIFY_PORT = 41237;
export const NOTIFY_LOCAL_HOST = "127.0.0.1";
export const NOTIFY_REMOTE_HOST = "127.0.0.1";
export const NOTIFY_EVENTS_PATH = "/events";
export const NOTIFY_HEALTH_PATH = "/healthz";

/** Ephemeral forward id per host — never persisted to relix.json. */
export function notifyForwardId(hostId: string): string {
  return `notify:${hostId}`;
}
