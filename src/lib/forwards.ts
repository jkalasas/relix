import type { PortForward, PortForwardConfig } from "@/lib/types";

export function formatForwardEndpoint(host: string, port: number): string {
  return `${host}:${port}`;
}

export function formatForwardSource(forward: PortForwardConfig): string {
  if (forward.type === "R") {
    return formatForwardEndpoint(forward.remoteHost, forward.remotePort);
  }
  return formatForwardEndpoint(forward.localHost, forward.localPort);
}

export function formatForwardTarget(forward: PortForwardConfig): string | null {
  if (forward.type === "D") return null;
  if (forward.type === "R") {
    return formatForwardEndpoint(forward.localHost, forward.localPort);
  }
  return formatForwardEndpoint(forward.remoteHost, forward.remotePort);
}

export function toPortForwardConfig(forward: PortForwardConfig): PortForwardConfig {
  return {
    id: forward.id,
    type: forward.type,
    localHost: forward.localHost,
    localPort: forward.localPort,
    remoteHost: forward.remoteHost,
    remotePort: forward.remotePort,
    autoStart: forward.autoStart,
  };
}

export function configToForward(config: PortForwardConfig): PortForward {
  return {
    ...config,
    status: "idle",
  };
}

export function configsToForwards(configs: PortForwardConfig[]): PortForward[] {
  return configs.map(configToForward);
}

export function idleForwards(forwards: PortForward[]): PortForward[] {
  return forwards.map((forward) => ({
    ...toPortForwardConfig(forward),
    status: "idle" as const,
    errorMessage: undefined,
  }));
}
