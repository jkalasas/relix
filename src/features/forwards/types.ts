export type ForwardType = "L" | "R" | "D";

export type ForwardStatus = "active" | "idle" | "error";

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
