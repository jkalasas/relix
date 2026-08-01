import type { HostConfig } from "@/features/hosts/types";

export function validateHostConfig(form: HostConfig): string | null {
  if (!form.name.trim()) return "Name is required";
  if (!form.user.trim()) return "User is required";
  if (!form.hostname.trim()) return "Hostname is required";
  if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) {
    return "Port must be between 1 and 65535";
  }
  if (form.authMethod === "password" && !form.password?.trim()) {
    return "Password is required";
  }
  if (
    form.authMethod === "private_key" &&
    !form.privateKey?.trim() &&
    !form.privateKeyPath?.trim()
  ) {
    return "Private key or key path is required";
  }
  return null;
}

export function normalizeHostConfig(form: HostConfig): HostConfig {
  const shellMode = form.shellMode === "tmux" ? "tmux" : "plain";
  const tmuxSession =
    shellMode === "tmux"
      ? form.tmuxSession?.trim() || undefined
      : undefined;
  return {
    ...form,
    name: form.name.trim(),
    user: form.user.trim(),
    hostname: form.hostname.trim(),
    password:
      form.authMethod === "password" ? form.password?.trim() : undefined,
    privateKey:
      form.authMethod === "private_key"
        ? form.privateKey?.trim() || undefined
        : undefined,
    privateKeyPath:
      form.authMethod === "private_key"
        ? form.privateKeyPath?.trim() || undefined
        : undefined,
    passphrase:
      form.authMethod === "private_key"
        ? form.passphrase?.trim() || undefined
        : undefined,
    shellMode,
    tmuxSession,
  };
}
