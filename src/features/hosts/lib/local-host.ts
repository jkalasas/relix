import type { Host } from "@/features/hosts/types";

export const LOCAL_HOST_ID = "local";

export function isLocalHostId(id: string): boolean {
  return id === LOCAL_HOST_ID;
}

export function isLocalHost(host: { id: string }): boolean {
  return isLocalHostId(host.id);
}

export function createLocalHost(): Host {
  return {
    id: LOCAL_HOST_ID,
    name: "Local",
    user: "local",
    hostname: "localhost",
    port: 22,
    authMethod: "password",
    shellMode: "tmux",
    status: "connected",
  };
}

export function withoutLocalHost<T extends { id: string }>(hosts: T[]): T[] {
  return hosts.filter((host) => !isLocalHostId(host.id));
}

export function withLocalHost(hosts: Host[], available: boolean): Host[] {
  const remotes = withoutLocalHost(hosts);
  if (!available) return remotes;
  return [createLocalHost(), ...remotes];
}
