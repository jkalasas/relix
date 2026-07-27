import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { sshResize, sshWrite } from "@/lib/ssh";
import { cn } from "@/lib/utils";

type TerminalViewProps = {
  sessionId: string;
  active: boolean;
  visible: boolean;
  onReady?: (api: { write: (data: string | Uint8Array) => void }) => void;
  onCwdChange?: (cwd: string) => void;
};

function parseOsc7Cwd(data: string): string | null {
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

function attachWebgl(term: Terminal) {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
    });
    term.loadAddon(webgl);
  } catch {
    // canvas fallback if webgl unavailable
  }
}

function restoreSurface(term: Terminal, fit: FitAddon, sessionId: string) {
  fit.fit();
  term.refresh(0, Math.max(0, term.rows - 1));
  void sshResize(sessionId, term.cols, term.rows);
}

export function TerminalView({
  sessionId,
  active,
  visible,
  onReady,
  onCwdChange,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onReadyRef = useRef(onReady);
  const onCwdChangeRef = useRef(onCwdChange);
  const lastCwdRef = useRef<string | null>(null);
  onReadyRef.current = onReady;
  onCwdChangeRef.current = onCwdChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      theme: {
        background: "oklch(0.12 0.012 250)",
        foreground: "oklch(0.93 0.012 250)",
        cursor: "oklch(0.78 0.145 75)",
        selectionBackground: "oklch(0.78 0.145 75 / 35%)",
        black: "oklch(0.2 0.02 250)",
        red: "oklch(0.68 0.18 25)",
        green: "oklch(0.74 0.13 155)",
        yellow: "oklch(0.78 0.12 85)",
        blue: "oklch(0.74 0.11 220)",
        magenta: "oklch(0.72 0.12 320)",
        cyan: "oklch(0.74 0.11 220)",
        white: "oklch(0.93 0.012 250)",
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    attachWebgl(term);
    fit.fit();
    void sshResize(sessionId, term.cols, term.rows);

    const dataSub = term.onData((data) => {
      void sshWrite(sessionId, data);
    });

    const osc7Sub = term.parser.registerOscHandler(7, (data) => {
      const cwd = parseOsc7Cwd(data);
      if (!cwd) return false;
      if (cwd === lastCwdRef.current) return true;
      lastCwdRef.current = cwd;
      onCwdChangeRef.current?.(cwd);
      return true;
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current?.offsetParent === null) return;
      fit.fit();
      void sshResize(sessionId, term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;
    lastCwdRef.current = null;
    onReadyRef.current?.({
      write: (data) => {
        term.write(data);
      },
    });

    return () => {
      dataSub.dispose();
      osc7Sub.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;

    const frame = requestAnimationFrame(() => {
      restoreSurface(term, fit, sessionId);
      if (active) term.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, visible, sessionId]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-0 min-w-0",
        active ? "relative flex-1" : "pointer-events-none absolute inset-0 opacity-0",
      )}
      aria-hidden={!active}
    />
  );
}
