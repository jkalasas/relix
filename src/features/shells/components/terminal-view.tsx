import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { parseOsc7Cwd } from "@/features/shells/lib/osc7";
import { sshResize, sshWrite } from "@/features/ssh";
import { cn } from "@/lib/utils";

type TerminalViewProps = {
  sessionId: string;
  active: boolean;
  visible: boolean;
  onReady?: (api: { write: (data: string | Uint8Array) => void }) => void;
  onCwdChange?: (cwd: string) => void;
};

function isTouchUi(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    return true;
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function attachWebgl(term: Terminal) {
  if (isTouchUi()) return;
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

function cellHeightPx(term: Terminal, element: HTMLElement): number {
  const measured = element.clientHeight / Math.max(1, term.rows);
  if (Number.isFinite(measured) && measured > 0) return measured;
  return Math.max(1, (term.options.fontSize ?? 12) * (term.options.lineHeight ?? 1));
}

function focusTerminal(term: Terminal) {
  term.focus();
  const textarea = term.element?.querySelector(
    ".xterm-helper-textarea",
  ) as HTMLTextAreaElement | null;
  textarea?.focus({ preventScroll: true });
}

function attachMobileScroll(term: Terminal, container: HTMLElement): () => void {
  if (!isTouchUi()) return () => {};

  const layer = document.createElement("div");
  layer.className = "xterm-mobile-scroll";
  layer.setAttribute("aria-hidden", "true");
  container.appendChild(layer);

  const dragThresholdPx = 10;
  let tracking = false;
  let scrolling = false;
  let startY = 0;
  let lastY = 0;
  let remainder = 0;

  const scrollByDelta = (deltaY: number) => {
    const scrollTarget =
      term.element?.querySelector(".xterm-scrollable-element") ?? term.element;
    if (scrollTarget) {
      scrollTarget.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -deltaY,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          bubbles: true,
          cancelable: true,
        }),
      );
      return;
    }

    const linePx = cellHeightPx(term, container);
    remainder += deltaY;
    const lines = Math.trunc(remainder / linePx);
    if (lines === 0) return;
    remainder -= lines * linePx;
    term.scrollLines(-lines);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      tracking = false;
      scrolling = false;
      return;
    }
    tracking = true;
    scrolling = false;
    startY = event.touches[0].clientY;
    lastY = startY;
    remainder = 0;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!tracking || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;

    // Ignore jitter so taps still open the keyboard.
    if (!scrolling) {
      if (Math.abs(y - startY) < dragThresholdPx) return;
      scrolling = true;
      lastY = y;
    }

    const delta = y - lastY;
    lastY = y;
    if (delta === 0) return;
    scrollByDelta(delta);
    event.preventDefault();
    event.stopPropagation();
  };

  const onTouchEnd = () => {
    if (!tracking) return;
    const wasTap = !scrolling;
    tracking = false;
    scrolling = false;
    remainder = 0;
    if (wasTap) focusTerminal(term);
  };

  layer.addEventListener("touchstart", onTouchStart, { passive: true });
  layer.addEventListener("touchmove", onTouchMove, { passive: false });
  layer.addEventListener("touchend", onTouchEnd, { passive: true });
  layer.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return () => {
    layer.removeEventListener("touchstart", onTouchStart);
    layer.removeEventListener("touchmove", onTouchMove);
    layer.removeEventListener("touchend", onTouchEnd);
    layer.removeEventListener("touchcancel", onTouchEnd);
    layer.remove();
  };
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
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: 5000,
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
    term.attachCustomKeyEventHandler((event) => {
      if (event.key === "Tab" && event.ctrlKey) return false;
      return true;
    });
    attachWebgl(term);
    fit.fit();
    void sshResize(sessionId, term.cols, term.rows);
    const detachMobileScroll = attachMobileScroll(term, containerRef.current);

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

    let fitFrame = 0;
    const scheduleFit = () => {
      if (containerRef.current?.offsetParent === null) return;
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(() => {
        fit.fit();
        void sshResize(sessionId, term.cols, term.rows);
      });
    };

    const ro = new ResizeObserver(() => scheduleFit());
    ro.observe(containerRef.current);

    // Only refit on viewport *resize* (keyboard open/close). Refitting on
    // visualViewport scroll fights drag-to-scroll and Android IME pan.
    const onViewportResize = () => scheduleFit();
    window.addEventListener("resize", onViewportResize);
    window.visualViewport?.addEventListener("resize", onViewportResize);

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
      detachMobileScroll();
      ro.disconnect();
      cancelAnimationFrame(fitFrame);
      window.removeEventListener("resize", onViewportResize);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
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
        "relative min-h-0 min-w-0 overflow-hidden",
        active
          ? "flex-1"
          : "pointer-events-none absolute inset-0 opacity-0",
      )}
      aria-hidden={!active}
    />
  );
}
