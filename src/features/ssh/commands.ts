import { invoke } from "@tauri-apps/api/core";
import type { HostConfig } from "@/features/hosts";
import type {
  OpenShellResult,
  FsListResult,
  SshConnectPayload,
  StartDynamicForwardPayload,
  StartLocalForwardPayload,
  StartRemoteForwardPayload,
  TmuxBootstrapResult,
  TmuxWindow,
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

export async function localShellAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("local_shell_available");
  } catch {
    return false;
  }
}

export async function appQuit(): Promise<void> {
  await invoke("app_quit");
}

export async function sshConnect(host: HostConfig): Promise<void> {
  await invoke("ssh_connect", { config: hostToConnectPayload(host) });
}

export async function sshDisconnect(hostId: string): Promise<void> {
  await invoke("ssh_disconnect", { hostId });
}

export async function sshCancelConnect(hostId: string): Promise<void> {
  await invoke("ssh_cancel_connect", { hostId });
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

export async function hostFsList(
  hostId: string,
  path: string,
): Promise<FsListResult> {
  return invoke<FsListResult>("host_fs_list", {
    config: { hostId, path },
  });
}

export async function hostFsRead(
  hostId: string,
  path: string,
): Promise<number[]> {
  return invoke<number[]>("host_fs_read", {
    config: { hostId, path },
  });
}

export async function hostFsWrite(
  hostId: string,
  path: string,
  data: number[] | Uint8Array,
): Promise<void> {
  await invoke("host_fs_write", {
    config: {
      hostId,
      path,
      data: Array.from(data),
    },
  });
}

export async function hostFsMkdir(
  hostId: string,
  path: string,
): Promise<void> {
  await invoke("host_fs_mkdir", { config: { hostId, path } });
}

export async function hostFsRemove(
  hostId: string,
  path: string,
  isDir: boolean,
): Promise<void> {
  await invoke("host_fs_remove", { config: { hostId, path, isDir } });
}

export async function hostFsRename(
  hostId: string,
  from: string,
  to: string,
): Promise<void> {
  await invoke("host_fs_rename", { config: { hostId, from, to } });
}

export async function sshTmuxBootstrap(
  hostId: string,
  session?: string,
): Promise<TmuxBootstrapResult> {
  return invoke<TmuxBootstrapResult>("ssh_tmux_bootstrap", {
    hostId,
    session,
  });
}

export async function sshTmuxNewWindow(
  hostId: string,
  options?: {
    session?: string;
    name?: string;
    command?: string;
    cwd?: string;
    sourceWindowId?: string;
  },
): Promise<TmuxWindow> {
  return invoke<TmuxWindow>("ssh_tmux_new_window", {
    hostId,
    session: options?.session,
    name: options?.name,
    command: options?.command,
    cwd: options?.cwd,
    sourceWindowId: options?.sourceWindowId,
  });
}

export async function sshTmuxListWindows(
  hostId: string,
  session?: string,
): Promise<TmuxBootstrapResult> {
  return invoke<TmuxBootstrapResult>("ssh_tmux_list_windows", {
    hostId,
    session,
  });
}

export async function sshTmuxKillWindow(
  hostId: string,
  session: string | undefined,
  windowId: string,
): Promise<void> {
  await invoke("ssh_tmux_kill_window", {
    hostId,
    session,
    windowId,
  });
}

export async function sshTmuxKillSession(
  hostId: string,
  session?: string,
): Promise<void> {
  await invoke("ssh_tmux_kill_session", {
    hostId,
    session,
  });
}

export async function sshTmuxWindowPath(
  hostId: string,
  session: string | undefined,
  windowId: string,
): Promise<string | null> {
  return invoke<string | null>("ssh_tmux_window_path", {
    hostId,
    session,
    windowId,
  });
}

function shSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function tmuxClientSession(session: string, windowId: string): string {
  const id = windowId.trim().replace(/^@/, "");
  return `${session}_w${id}`;
}

/** One grouped client session per window so tabs keep independent views. */
export function tmuxAttachCommand(session: string, windowId: string): string {
  const client = tmuxClientSession(session, windowId);
  const clientQ = shSingleQuote(client);
  const baseQ = shSingleQuote(session);
  const win = windowId.trim();
  const script = [
    `tmux has-session -t ${clientQ} 2>/dev/null || tmux new-session -d -s ${clientQ} -t ${baseQ}`,
    `tmux set-option -t ${clientQ} status off`,
    `tmux set-option -t ${baseQ} status off`,
    `tmux set-option -t ${clientQ} set-titles off`,
    `tmux select-window -t ${clientQ}:${win}`,
    `exec tmux attach-session -t ${clientQ}`,
  ].join("; ");
  return `bash -lc ${shSingleQuote(script)}`;
}
