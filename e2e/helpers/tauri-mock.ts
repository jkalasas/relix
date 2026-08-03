/**
 * Minimal Tauri 2 IPC shim for browser E2E (no webview / no Rust).
 * Installed via page.addInitScript before app code runs.
 *
 * Critical behaviors:
 * - plugin:store|* backs LazyStore so boot loadHostConfigs/loadProjects/loadForwards succeed
 * - plugin:event|listen returns an id so useSshLifecycle can subscribe
 * - plugin:relix-keepalive|is_keepalive_running REJECTS so isAndroidPlatform() is false
 *   (a successful invoke would make the app treat the session as Android)
 * - local_shell_available → false
 */
export function tauriMockInitScript(): string {
  return `(() => {
    const stores = new Map();
    let nextRid = 1;
    let nextCallbackId = 1;
    let nextEventId = 1;
    const callbacks = new Map();

    function getStore(rid) {
      if (!stores.has(rid)) {
        stores.set(rid, new Map());
      }
      return stores.get(rid);
    }

    async function invoke(cmd, args = {}) {
      if (cmd === "local_shell_available") return false;

      if (cmd === "plugin:relix-keepalive|is_keepalive_running") {
        throw new Error("not android");
      }

      if (cmd === "plugin:store|load") {
        const rid = nextRid++;
        stores.set(rid, new Map());
        return rid;
      }
      if (cmd === "plugin:store|get_store") {
        return null;
      }
      if (cmd === "plugin:store|get") {
        const map = getStore(args.rid);
        if (!map.has(args.key)) return [null, false];
        return [map.get(args.key), true];
      }
      if (cmd === "plugin:store|set") {
        getStore(args.rid).set(args.key, args.value);
        return null;
      }
      if (cmd === "plugin:store|has") {
        return getStore(args.rid).has(args.key);
      }
      if (cmd === "plugin:store|delete") {
        return getStore(args.rid).delete(args.key);
      }
      if (cmd === "plugin:store|clear") {
        getStore(args.rid).clear();
        return null;
      }
      if (cmd === "plugin:store|reset") {
        getStore(args.rid).clear();
        return null;
      }
      if (cmd === "plugin:store|keys") {
        return Array.from(getStore(args.rid).keys());
      }
      if (cmd === "plugin:store|values") {
        return Array.from(getStore(args.rid).values());
      }
      if (cmd === "plugin:store|entries") {
        return Array.from(getStore(args.rid).entries());
      }
      if (cmd === "plugin:store|length") {
        return getStore(args.rid).size;
      }
      if (cmd === "plugin:store|save" || cmd === "plugin:store|reload") {
        return null;
      }

      if (cmd === "plugin:event|listen") {
        return nextEventId++;
      }
      if (cmd === "plugin:event|unlisten") {
        return null;
      }

      if (cmd === "plugin:resources|close") {
        return null;
      }

      // Unknown commands: reject so feature try/catch paths treat them as unavailable
      throw new Error("unmocked tauri invoke: " + cmd);
    }

    window.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback(callback, _once) {
        const id = nextCallbackId++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id) {
        callbacks.delete(id);
      },
      convertFileSrc(filePath, protocol = "asset") {
        return protocol + "://localhost/" + String(filePath).replace(/^\\/+/, "");
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    };

    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener(_event, _eventId) {},
    };

    // Keep isTauri() false so desktop title-bar window APIs are not exercised
    // (isTauri checks globalThis.isTauri, not __TAURI_INTERNALS__)
  })();`;
}
