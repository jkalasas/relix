import { useEffect } from "react";
import { configsToHosts } from "@/features/hosts/convert";
import {
  LOCAL_HOST_ID,
  withoutLocalHost,
} from "@/features/hosts/local-host";
import { loadHostConfigs } from "@/features/hosts/store";
import type { Host } from "@/features/hosts/types";
import { localShellAvailable } from "@/features/ssh";

type UseBootOptions = {
  setHosts: (hosts: Host[], localAvailable?: boolean) => void;
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
        const [configs, localAvailable] = await Promise.all([
          loadHostConfigs(),
          localShellAvailable(),
        ]);
        if (cancelled) return;
        const remotes = withoutLocalHost(configsToHosts(configs));
        setHosts(remotes, localAvailable);
        await loadForwards(remotes.map((host) => host.id));
        if (cancelled) return;
        setSelectedId(
          remotes[0]?.id ?? (localAvailable ? LOCAL_HOST_ID : null),
        );
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadForwards, setBooting, setHosts, setSelectedId]);
}
