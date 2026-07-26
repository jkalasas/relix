export type HostStatus = "connected" | "idle" | "error";

export type WorkspaceTab = "terminal" | "sftp" | "forwards";

export type ForwardType = "L" | "R" | "D";

export type ForwardStatus = "active" | "idle" | "error";

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

export type PortForwardConfig = {
  id: string;
  type: ForwardType;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  autoStart: boolean;
};

export type PortForward = PortForwardConfig & {
  status: ForwardStatus;
  errorMessage?: string;
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
  | "bind_failed"
  | "forward_failed"
  | "not_found"
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
