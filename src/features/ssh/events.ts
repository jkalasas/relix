import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  SshConnectionClosedEvent,
  SshDataEvent,
  SshErrorEvent,
  SshForwardClosedEvent,
  SshForwardErrorEvent,
  SshShellClosedEvent,
} from "@/features/ssh/types";

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
