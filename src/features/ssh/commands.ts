import { invoke } from "@tauri-apps/api/core";
import type { HostConfig } from "@/features/hosts/types";
import type {
  OpenShellResult,
  SshConnectPayload,
  StartDynamicForwardPayload,
  StartLocalForwardPayload,
  StartRemoteForwardPayload,
} from "@/features/ssh/types";

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
  options?: {
    cols?: number;
    rows?: number;
    command?: string;
    cwd?: string;
  },
): Promise<OpenShellResult> {
  return invoke<OpenShellResult>("ssh_open_shell", {
    hostId,
    cols: options?.cols,
    rows: options?.rows,
    command: options?.command,
    cwd: options?.cwd,
  });
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

export async function sshStartLocalForward(
  config: StartLocalForwardPayload,
): Promise<void> {
  await invoke("ssh_start_local_forward", { config });
}

export async function sshStartRemoteForward(
  config: StartRemoteForwardPayload,
): Promise<void> {
  await invoke("ssh_start_remote_forward", { config });
}

export async function sshStartDynamicForward(
  config: StartDynamicForwardPayload,
): Promise<void> {
  await invoke("ssh_start_dynamic_forward", { config });
}

export async function sshStopForward(forwardId: string): Promise<void> {
  await invoke("ssh_stop_forward", { forwardId });
}
