export type HostStatus = "connected" | "idle" | "error";

export type WorkspaceTab = "terminal" | "sftp" | "forwards";

export type ForwardType = "L" | "R" | "D";

export type ForwardStatus = "active" | "idle";

export type Host = {
  id: string;
  name: string;
  user: string;
  hostname: string;
  port: number;
  status: HostStatus;
};

export type PortForward = {
  id: string;
  type: ForwardType;
  local: string;
  remote: string;
  status: ForwardStatus;
};
