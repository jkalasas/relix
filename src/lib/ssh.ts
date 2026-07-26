import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  HostConfig,
  OpenShellResult,
  SshCommandError,
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

export function parseSshError(error: unknown): SshCommandError {
  if (typeof error === "object" && error !== null && "code" in error) {
    return error as SshCommandError;
  }
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as SshCommandError;
      if (parsed && typeof parsed.code === "string") return parsed;
    } catch {
      // fall through
    }
    return { code: "internal", message: error };
  }
  return { code: "internal", message: "Unknown SSH error" };
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

export type SshDataEvent = { sessionId: string; data: string };
export type SshShellClosedEvent = {
  sessionId: string;
  hostId: string;
  reason?: string;
};
export type SshConnectionClosedEvent = { hostId: string; reason?: string };
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

export async function listenSshError(
  handler: (event: SshErrorEvent) => void,
): Promise<UnlistenFn> {
  return listen<SshErrorEvent>("ssh://error", (e) => handler(e.payload));
}
