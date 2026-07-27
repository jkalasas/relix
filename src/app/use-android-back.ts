import { useEffect } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";

type UseAndroidBackOptions = {
  handleBack: () => boolean;
};

export function useAndroidBack({ handleBack }: UseAndroidBackOptions) {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void onBackButtonPress(async () => {
      if (handleBack()) return;
      try {
        await getCurrentWindow().close();
      } catch {
        // desktop / unsupported — ignore
      }
    })
      .then((listener) => {
        if (disposed) {
          void listener.unregister();
          return;
        }
        unlisten = () => {
          void listener.unregister();
        };
      })
      .catch(() => {
        // app.registerListener is mobile-only; desktop rejects this command
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleBack]);
}
