import { LazyStore } from "@tauri-apps/plugin-store";
import type { HostConfig } from "@/features/hosts/types";

const STORE_PATH = "relix.json";
const HOSTS_KEY = "hosts";

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_PATH));
  }
  return storePromise;
}

export async function loadHostConfigs(): Promise<HostConfig[]> {
  try {
    const store = await getStore();
    const hosts = await store.get<HostConfig[]>(HOSTS_KEY);
    if (!Array.isArray(hosts)) return [];
    return hosts;
  } catch {
    return [];
  }
}

export async function saveHostConfigs(hosts: HostConfig[]): Promise<void> {
  const store = await getStore();
  await store.set(HOSTS_KEY, hosts);
  await store.save();
}
