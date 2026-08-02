import { useEffect } from "react";
import {
  configsToHosts,
  loadHostConfigs,
  LOCAL_HOST_ID,
  withoutLocalHost,
  type Host,
} from "@/features/hosts";
import { localShellAvailable } from "@/features/ssh";

type UseBootOptions = {
  setHosts: (hosts: Host[], localAvailable?: boolean) => void;
  loadForwards: (hostIds: string[]) => Promise<unknown>;
  loadProjects: () => Promise<unknown>;
  syncHostProjects: (hostId: string) => Promise<unknown>;
  bootstrapLocalTmux?: () => Promise<unknown>;
  setBooting: (booting: boolean) => void;
};

export function useBoot({
  setHosts,
  loadForwards,
  loadProjects,
  syncHostProjects,
  bootstrapLocalTmux,
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
        if (cancelled) return;
        if (localAvailable) {
          try {
            await syncHostProjects(LOCAL_HOST_ID);
          } catch {
            // keep client cache until a later successful sync
          }
          if (cancelled) return;
          try {
            await bootstrapLocalTmux?.();
          } catch {
            // shells stay empty until the user opens one
          }
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapLocalTmux,
    loadForwards,
    loadProjects,
    setBooting,
    setHosts,
    syncHostProjects,
  ]);
}
