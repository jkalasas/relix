import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  HostConfig,
  OpenShellResult,
  SshCommandError,
  SshErrorCode,
} from "@/lib/types";

export type SshConnectPayload = {
  hostId: string;
  user: string;
  hostname: string;
  port: number;
  authMethod: HostConfig["authMethod"];
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
};

/** Known SshErrorCode values emitted by the Rust bridge (snake_case). */
const KNOWN_SSH_ERROR_CODES: ReadonlySet<string> = new Set([
  "host_key_unknown",
  "host_key_changed",
  "auth_failed",
  "connect_failed",
  "key_unreadable",
  "invalid_key",
  "not_connected",
  "bind_failed",
  "forward_failed",
  "not_found",
  "internal",
]);

function isSshErrorCode(code: unknown): code is SshErrorCode {
  return typeof code === "string" && KNOWN_SSH_ERROR_CODES.has(code);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalPort(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalize a value into SshCommandError when it looks like a structured
 * SshError payload from the Rust side.
 */
function asSshCommandError(value: unknown): SshCommandError | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (!isSshErrorCode(obj.code)) return null;

  const message =
    typeof obj.message === "string" && obj.message.length > 0
      ? obj.message
      : obj.code;

  return {
    code: obj.code,
    message,
    hostname: optionalString(obj.hostname),
    port: optionalPort(obj.port),
    algorithm: optionalString(obj.algorithm),
    keyBase64: optionalString(obj.keyBase64),
    fingerprint: optionalString(obj.fingerprint),
  };
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Parse errors thrown by Tauri `invoke` for SSH commands.
 *
 * Tauri 2 serializes `Result<T, E>` where E: Serialize via
 * `serde_json::to_value`, so the frontend usually receives the structured
 * SshError object. We also defend against JSON strings and nested
 * `{ message }` wrappers seen across IPC / mock paths.
 */
export function parseSshError(error: unknown): SshCommandError {
  // 1. Structured object with a known `code` field
  const direct = asSshCommandError(error);
  if (direct) return direct;

  // 2. JSON string of SshError
  if (typeof error === "string") {
    const parsed = tryParseJson(error);
    const fromJson = asSshCommandError(parsed);
    if (fromJson) return fromJson;
    return { code: "internal", message: error };
  }

  // 3. Nested structures like `{ message: string }` where message is JSON
  //    or a plain string (Error-like objects, some IPC wrappers).
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") {
      const nestedParsed = tryParseJson(obj.message);
      const fromNested = asSshCommandError(nestedParsed);
      if (fromNested) return fromNested;

      // message itself might already be a structured object after some bridges
      const fromMessageObject = asSshCommandError(obj.message);
      if (fromMessageObject) return fromMessageObject;

      return { code: "internal", message: obj.message };
    }

    // Some bridges nest under `error` or `data`
    for (const key of ["error", "data", "payload"] as const) {
      const nested = asSshCommandError(obj[key]);
      if (nested) return nested;
      if (typeof obj[key] === "string") {
        const fromKey = asSshCommandError(tryParseJson(obj[key] as string));
        if (fromKey) return fromKey;
      }
    }
  }

  // 4. Fallback
  return { code: "internal", message: "Unknown SSH error" };
}

export function hostToConnectPayload(host: HostConfig): SshConnectPayload {
  return {
    hostId: host.id,
    user: host.user,
    hostname: host.hostname,
    port: host.port,
    authMethod: host.authMethod,
    password: host.password,
    privateKey: host.privateKey,
    privateKeyPath: host.privateKeyPath,
    passphrase: host.passphrase,
  };
}

export async function sshConnect(host: HostConfig): Promise<void> {
  await invoke("ssh_connect", { config: hostToConnectPayload(host) });
}

export async function sshDisconnect(hostId: string): Promise<void> {
  await invoke("ssh_disconnect", { hostId });
}

export async function sshOpenShell(
  hostId: string,
  cols?: number,
  rows?: number,
): Promise<OpenShellResult> {
  return invoke<OpenShellResult>("ssh_open_shell", { hostId, cols, rows });
}

export async function sshCloseShell(sessionId: string): Promise<void> {
  await invoke("ssh_close_shell", { sessionId });
}

export async function sshWrite(sessionId: string, data: string): Promise<void> {
  await invoke("ssh_write", { sessionId, data });
}

export async function sshResize(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke("ssh_resize", { sessionId, cols, rows });
}

export async function sshTrustHostKey(input: {
  hostname: string;
  port: number;
  algorithm: string;
  keyBase64: string;
}): Promise<void> {
  await invoke("ssh_trust_host_key", input);
}

export type StartLocalForwardPayload = {
  hostId: string;
  forwardId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
};

export async function sshStartLocalForward(
  config: StartLocalForwardPayload,
): Promise<void> {
  await invoke("ssh_start_local_forward", { config });
}

export async function sshStopForward(forwardId: string): Promise<void> {
  await invoke("ssh_stop_forward", { forwardId });
}

export type SshDataEvent = { sessionId: string; data: string };
export type SshShellClosedEvent = {
  sessionId: string;
  hostId: string;
  reason?: string;
};
export type SshConnectionClosedEvent = { hostId: string; reason?: string };
export type SshForwardClosedEvent = {
  hostId: string;
  forwardId: string;
  reason?: string;
};
export type SshForwardErrorEvent = {
  hostId: string;
  forwardId: string;
  message: string;
};
export type SshErrorEvent = {
  hostId: string;
  sessionId?: string;
  message: string;
};

export function decodeSshData(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function listenSshData(
  handler: (event: SshDataEvent) => void,
): Promise<UnlistenFn> {
  return listen<SshDataEvent>("ssh://data", (e) => handler(e.payload));
}

export async function listenSshShellClosed(
  handler: (event: SshShellClosedEvent) => void,
): Promise<UnlistenFn> {
  return listen<SshShellClosedEvent>("ssh://shell-closed", (e) =>
    handler(e.payload),
  );
}

export async function listenSshConnectionClosed(
  handler: (event: SshConnectionClosedEvent) => void,
): Promise<UnlistenFn> {
  return listen<SshConnectionClosedEvent>("ssh://connection-closed", (e) =>
    handler(e.payload),
  );
}

export async function listenSshForwardClosed(
  handler: (event: SshForwardClosedEvent) => void,
): Promise<UnlistenFn> {
  return listen<SshForwardClosedEvent>("ssh://forward-closed", (e) =>
    handler(e.payload),
  );
}

export async function listenSshForwardError(
  handler: (event: SshForwardErrorEvent) => void,
): Promise<UnlistenFn> {
  return listen<SshForwardErrorEvent>("ssh://forward-error", (e) =>
    handler(e.payload),
  );
}

export async function listenSshError(
  handler: (event: SshErrorEvent) => void,
): Promise<UnlistenFn> {
  return listen<SshErrorEvent>("ssh://error", (e) => handler(e.payload));
}
