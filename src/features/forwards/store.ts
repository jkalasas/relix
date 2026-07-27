import { LazyStore } from "@tauri-apps/plugin-store";
import type { PortForwardConfig } from "@/features/forwards/types";

const STORE_PATH = "relix.json";
const FORWARDS_KEY = "forwards";

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_PATH));
  }
  return storePromise;
}

function isPortForwardConfig(value: unknown): value is PortForwardConfig {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    (obj.type === "L" || obj.type === "R" || obj.type === "D") &&
    typeof obj.localHost === "string" &&
    typeof obj.localPort === "number" &&
    typeof obj.remoteHost === "string" &&
    typeof obj.remotePort === "number" &&
    typeof obj.autoStart === "boolean"
  );
}

export async function loadForwardsByHost(): Promise<
  Record<string, PortForwardConfig[]>
> {
  try {
    const store = await getStore();
    const raw = await store.get<Record<string, unknown>>(FORWARDS_KEY);
    if (!raw || typeof raw !== "object") return {};

    const result: Record<string, PortForwardConfig[]> = {};
    for (const [hostId, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      result[hostId] = list.filter(isPortForwardConfig);
    }
    return result;
  } catch {
    return {};
  }
}

export async function saveForwardsByHost(
  forwards: Record<string, PortForwardConfig[]>,
): Promise<void> {
  const store = await getStore();
  await store.set(FORWARDS_KEY, forwards);
  await store.save();
}
