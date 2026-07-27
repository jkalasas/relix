export type HostStatus = "connected" | "idle" | "error";

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
