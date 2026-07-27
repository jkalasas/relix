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
  | "transfer_failed"
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

export type SshConnectPayload = {
  hostId: string;
  user: string;
  hostname: string;
  port: number;
  authMethod: "password" | "private_key";
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
};

export type StartLocalForwardPayload = {
  hostId: string;
  forwardId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
};

export type StartRemoteForwardPayload = {
  hostId: string;
  forwardId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
};

export type StartDynamicForwardPayload = {
  hostId: string;
  forwardId: string;
  localHost: string;
  localPort: number;
};

export type SftpEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
};

export type SftpListResult = {
  path: string;
  entries: SftpEntry[];
};

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

export type SshAuthBannerEvent = {
  hostId: string;
  message: string;
  checkUrl?: string | null;
};
