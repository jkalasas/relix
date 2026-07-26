import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { sshResize, sshWrite } from "@/lib/ssh";

type TerminalViewProps = {
  sessionId: string;
  active: boolean;
  dataEpoch?: number;
  onReady?: (api: { write: (data: string | Uint8Array) => void }) => void;
};

export function TerminalView({
  sessionId,
  active,
  onReady,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // canvas fallback if webgl unavailable
    }
    fit.fit();
    void sshResize(sessionId, term.cols, term.rows);

    const dataSub = term.onData((data) => {
      void sshWrite(sessionId, data);
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      void sshResize(sessionId, term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;
    onReady?.({
      write: (data) => {
        term.write(data);
      },
    });

    return () => {
      dataSub.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId, onReady]);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    void sshResize(sessionId, term.cols, term.rows);
    term.focus();
  }, [active, sessionId]);

  return (
    <div
      className="min-h-0 min-w-0 flex-1"
      style={{ display: active ? "block" : "none" }}
      ref={containerRef}
    />
  );
}
