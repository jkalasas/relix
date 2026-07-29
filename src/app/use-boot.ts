import { useEffect } from "react";
import { configsToHosts } from "@/features/hosts/convert";
import { withoutLocalHost } from "@/features/hosts/local-host";
import { loadHostConfigs } from "@/features/hosts/store";
import type { Host } from "@/features/hosts/types";
import { localShellAvailable } from "@/features/ssh";

type UseBootOptions = {
  setHosts: (hosts: Host[], localAvailable?: boolean) => void;
  loadForwards: (hostIds: string[]) => Promise<unknown>;
  loadProjects: () => Promise<unknown>;
  setBooting: (booting: boolean) => void;
};

export function useBoot({
  setHosts,
  loadForwards,
  loadProjects,
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
        await Promise.all([
          loadForwards(remotes.map((host) => host.id)),
          loadProjects(),
        ]);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadForwards, loadProjects, setBooting, setHosts]);
}
