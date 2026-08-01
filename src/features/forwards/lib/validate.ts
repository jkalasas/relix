import type { PortForwardConfig } from "@/features/forwards/types";

export function validateForwardConfig(form: PortForwardConfig): string | null {
  if (!form.localHost.trim()) {
    return form.type === "R"
      ? "Local target host is required"
      : "Local bind host is required";
  }
  if (
    !Number.isInteger(form.localPort) ||
    form.localPort < 1 ||
    form.localPort > 65535
  ) {
    return form.type === "R"
      ? "Local target port must be between 1 and 65535"
      : "Local port must be between 1 and 65535";
  }
  if (form.type === "D") return null;
  if (!form.remoteHost.trim()) {
    return form.type === "R"
      ? "Remote listen host is required"
      : "Remote host is required";
  }
  if (
    !Number.isInteger(form.remotePort) ||
    form.remotePort < 1 ||
    form.remotePort > 65535
  ) {
    return form.type === "R"
      ? "Remote listen port must be between 1 and 65535"
      : "Remote port must be between 1 and 65535";
  }
  return null;
}

export function normalizeForwardConfig(form: PortForwardConfig): PortForwardConfig {
  return {
    id: form.id,
    type: form.type,
    localHost: form.localHost.trim(),
    localPort: form.localPort,
    remoteHost: form.type === "D" ? "" : form.remoteHost.trim(),
    remotePort: form.type === "D" ? 0 : form.remotePort,
    autoStart: form.autoStart,
  };
}

export function descriptionForForwardType(
  type: PortForwardConfig["type"],
): string {
  if (type === "R") {
    return "Remote forward (R) — listen on the SSH host and forward to a target on this machine.";
  }
  if (type === "D") {
    return "Dynamic SOCKS (D) — SOCKS5 proxy on this machine through the session.";
  }
  return "Local forward (L) — bind a port on this machine to a host reachable from the remote session.";
}
