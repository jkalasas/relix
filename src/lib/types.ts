export type HostStatus = "connected" | "idle" | "error";

export type WorkspaceTab = "terminal" | "sftp" | "forwards";

export type ForwardType = "L" | "R" | "D";

export type ForwardStatus = "active" | "idle";

export type AuthMethod = "password" | "private_key";

export type HostConfig = {
  id: string;
  name: string;
  user: string;
  hostname: string;
  port: number;
  authMethod: AuthMethod;
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
};

export type Host = HostConfig & {
  status: HostStatus;
};

export type PortForward = {
  id: string;
  type: ForwardType;
  local: string;
  remote: string;
  status: ForwardStatus;
};

export type ShellSession = {
  id: string;
  hostId: string;
  title: string;
};

export type KnownHostEntry = {
  algorithm: string;
  keyBase64: string;
};

export type SshErrorCode =
  | "host_key_unknown"
  | "host_key_changed"
  | "auth_failed"
  | "connect_failed"
  | "key_unreadable"
  | "invalid_key"
  | "not_connected"
  | "internal";

export type SshCommandError = {
  code: SshErrorCode;
  message: string;
  hostname?: string;
  port?: number;
  algorithm?: string;
  keyBase64?: string;
  fingerprint?: string;
};

export type OpenShellResult = {
  sessionId: string;
};
