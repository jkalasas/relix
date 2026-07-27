import type { Host, HostConfig } from "@/features/hosts/types";

export function toHostConfig(host: HostConfig): HostConfig {
  return {
    id: host.id,
    name: host.name,
    user: host.user,
    hostname: host.hostname,
    port: host.port,
    authMethod: host.authMethod,
    password: host.password,
    privateKey: host.privateKey,
    privateKeyPath: host.privateKeyPath,
    passphrase: host.passphrase,
  };
}

export function configsToHosts(configs: HostConfig[]): Host[] {
  return configs.map((config) => ({ ...config, status: "idle" as const }));
}
