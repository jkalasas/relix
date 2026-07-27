import { useEffect } from "react";
import { configsToHosts } from "@/features/hosts/convert";
import { loadHostConfigs } from "@/features/hosts/store";
import type { Host } from "@/features/hosts/types";

type UseBootOptions = {
  setHosts: (hosts: Host[]) => void;
  loadForwards: (hostIds: string[]) => Promise<unknown>;
  setSelectedId: (id: string | null) => void;
  setBooting: (booting: boolean) => void;
};

export function useBoot({
  setHosts,
  loadForwards,
  setSelectedId,
  setBooting,
}: UseBootOptions) {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const configs = await loadHostConfigs();
        if (cancelled) return;
        setHosts(configsToHosts(configs));
        await loadForwards(configs.map((config) => config.id));
        if (cancelled) return;
        setSelectedId(configs[0]?.id ?? null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadForwards, setBooting, setHosts, setSelectedId]);
}
