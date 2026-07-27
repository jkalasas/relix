export function parseOsc7Cwd(data: string): string | null {
  const raw = data.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.includes("://")) return raw;

  if (!raw.startsWith("file://")) return null;

  try {
    const url = new URL(raw);
    if (url.protocol === "file:") {
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith("/")) return path;
    }
  } catch {
    // unencoded spaces and other non-strict file URLs
  }

  const rest = raw.slice("file://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const path = rest.slice(slash);
  try {
    const decoded = decodeURIComponent(path);
    return decoded.startsWith("/") ? decoded : null;
  } catch {
    return path.startsWith("/") ? path : null;
  }
}
