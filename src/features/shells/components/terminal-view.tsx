import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { parseOsc7Cwd } from "@/features/shells/lib/osc7";
import {
  adjustTerminalFontSize,
  getTerminalFontSize,
  resetTerminalFontSize,
  setTerminalFontSize,
  subscribeTerminalFontSize,
  TERMINAL_FONT_STEP,
} from "@/features/shells/lib/terminal-font";
import {
  applyStickyToInput,
  EMPTY_STICKY_MODS,
  hasStickyMods,
  type StickyMods,
} from "@/features/shells/lib/terminal-keys";
import { isMobileOs } from "@/features/shells/lib/mobile-os";
import { sshResize, sshWrite } from "@/features/ssh";
import {
  isCloseTabShortcut,
  isNewShellShortcut,
} from "@/lib/shortcut-chords";
import { cn } from "@/lib/utils";

export type TerminalSessionApi = {
  write: (data: string | Uint8Array) => void;
  send: (data: string) => void;
  focus: (options?: { force?: boolean }) => void;
};

type TerminalViewProps = {
  sessionId: string;
  active: boolean;
  visible: boolean;
  stickyMods?: StickyMods;
  onStickyConsumed?: () => void;
  onReady?: (api: TerminalSessionApi) => void | (() => void);
  onCwdChange?: (cwd: string) => void;
};

function isTouchUi(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    return true;
  }
  return isMobileOs();
}

function attachWebgl(
  term: Terminal,
  previous?: WebglAddon | null,
): WebglAddon | null {
  if (isTouchUi()) return null;
  try {
    previous?.dispose();
  } catch {
    // already disposed
  }
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      try {
        webgl.dispose();
      } catch {
        // ignore
      }
    });
    term.loadAddon(webgl);
    return webgl;
  } catch {
    return null;
  }
}

function restoreSurface(term: Terminal, fit: FitAddon, sessionId: string) {
  fit.fit();
  term.refresh(0, Math.max(0, term.rows - 1));
  void sshResize(sessionId, term.cols, term.rows);
}

function applyFontSize(
  term: Terminal,
  fit: FitAddon,
  sessionId: string,
  size: number,
) {
  term.options.fontSize = size;
  fit.fit();
  void sshResize(sessionId, term.cols, term.rows);
}

function cellHeightPx(term: Terminal, element: HTMLElement): number {
  const measured = element.clientHeight / Math.max(1, term.rows);
  if (Number.isFinite(measured) && measured > 0) return measured;
  return Math.max(1, (term.options.fontSize ?? 12) * (term.options.lineHeight ?? 1));
}

function helperTextarea(term: Terminal): HTMLTextAreaElement | null {
  return (
    (term.element?.querySelector(
      ".xterm-helper-textarea",
    ) as HTMLTextAreaElement | null) ?? null
  );
}

function focusTerminal(term: Terminal, options?: { force?: boolean }) {
  const textarea = helperTextarea(term);
  if (!textarea) {
    term.focus();
    return;
  }

  const alreadyFocused = document.activeElement === textarea;
  if (alreadyFocused || options?.force) {
    // Dismissing the soft keyboard often leaves the helper focused; a no-op
    // focus() will not reopen the IME on Android/iOS WebViews.
    textarea.blur();
    term.focus();
    textarea.focus({ preventScroll: true });
    return;
  }

  term.focus();
  textarea.focus({ preventScroll: true });
}

function isZoomModifier(event: KeyboardEvent | WheelEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function isFontZoomKey(event: KeyboardEvent): "in" | "out" | "reset" | null {
  if (!isZoomModifier(event) || event.altKey) return null;
  if (event.key === "=" || event.key === "+" || event.code === "NumpadAdd") {
    return "in";
  }
  if (event.key === "-" || event.code === "NumpadSubtract") {
    return "out";
  }
  if (event.key === "0" || event.code === "Numpad0") {
    return "reset";
  }
  return null;
}

function applyZoomAction(action: "in" | "out" | "reset") {
  if (action === "in") {
    adjustTerminalFontSize(TERMINAL_FONT_STEP);
    return;
  }
  if (action === "out") {
    adjustTerminalFontSize(-TERMINAL_FONT_STEP);
    return;
  }
  resetTerminalFontSize();
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function attachMobileScroll(
  term: Terminal,
  container: HTMLElement,
  shouldForceFocus: () => boolean,
  clearForceFocus: () => void,
): () => void {
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

  let pinching = false;
  let pinchStartDistance = 0;
  let pinchStartFontSize = getTerminalFontSize();

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
    if (event.touches.length === 2) {
      tracking = false;
      scrolling = false;
      pinching = true;
      pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
      pinchStartFontSize = getTerminalFontSize();
      return;
    }

    if (event.touches.length !== 1) {
      tracking = false;
      scrolling = false;
      pinching = false;
      return;
    }

    pinching = false;
    tracking = true;
    scrolling = false;
    startY = event.touches[0].clientY;
    lastY = startY;
    remainder = 0;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (pinching && event.touches.length === 2) {
      const distance = touchDistance(event.touches[0], event.touches[1]);
      if (pinchStartDistance > 0) {
        const scale = distance / pinchStartDistance;
        setTerminalFontSize(pinchStartFontSize * scale);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

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

  const onTouchEnd = (event: TouchEvent) => {
    if (pinching) {
      if (event.touches.length < 2) {
        pinching = false;
        pinchStartDistance = 0;
      }
      return;
    }

    if (!tracking) return;
    const wasTap = !scrolling;
    tracking = false;
    scrolling = false;
    remainder = 0;
    if (!wasTap) return;

    const force = shouldForceFocus();
    focusTerminal(term, { force });
    clearForceFocus();
  };

  const onClick = () => {
    const force = shouldForceFocus();
    focusTerminal(term, { force });
    clearForceFocus();
  };

  layer.addEventListener("touchstart", onTouchStart, { passive: true });
  layer.addEventListener("touchmove", onTouchMove, { passive: false });
  layer.addEventListener("touchend", onTouchEnd, { passive: true });
  layer.addEventListener("touchcancel", onTouchEnd, { passive: true });
  layer.addEventListener("click", onClick);

  return () => {
    layer.removeEventListener("touchstart", onTouchStart);
    layer.removeEventListener("touchmove", onTouchMove);
    layer.removeEventListener("touchend", onTouchEnd);
    layer.removeEventListener("touchcancel", onTouchEnd);
    layer.removeEventListener("click", onClick);
    layer.remove();
  };
}

function attachFontZoom(
  term: Terminal,
  fit: FitAddon,
  sessionId: string,
  container: HTMLElement,
  isActive: () => boolean,
): () => void {
  let resizeFrame = 0;
  let pendingSize: number | null = null;

  const flushFontSize = (size: number) => {
    pendingSize = size;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (pendingSize == null) return;
      applyFontSize(term, fit, sessionId, pendingSize);
      pendingSize = null;
    });
  };

  const unsubscribe = subscribeTerminalFontSize((size) => {
    if (term.options.fontSize === size) return;
    flushFontSize(size);
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isActive()) return;
    const action = isFontZoomKey(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    applyZoomAction(action);
  };

  const onWheel = (event: WheelEvent) => {
    if (!isActive()) return;
    if (!isZoomModifier(event) || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY === 0) return;
    adjustTerminalFontSize(event.deltaY < 0 ? TERMINAL_FONT_STEP : -TERMINAL_FONT_STEP);
  };

  // Desktop trackpad pinch often surfaces as ctrl+wheel; also handle
  // two-finger pinch on non-mobile surfaces that still expose touch.
  let pinching = false;
  let pinchStartDistance = 0;
  let pinchStartFontSize = getTerminalFontSize();

  const onTouchStart = (event: TouchEvent) => {
    if (!isActive() || isTouchUi()) return;
    if (event.touches.length !== 2) {
      pinching = false;
      return;
    }
    pinching = true;
    pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
    pinchStartFontSize = getTerminalFontSize();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!pinching || event.touches.length !== 2) return;
    const distance = touchDistance(event.touches[0], event.touches[1]);
    if (pinchStartDistance > 0) {
      setTerminalFontSize(pinchStartFontSize * (distance / pinchStartDistance));
    }
    event.preventDefault();
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!pinching) return;
    if (event.touches.length < 2) {
      pinching = false;
      pinchStartDistance = 0;
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchmove", onTouchMove, { passive: false });
  container.addEventListener("touchend", onTouchEnd, { passive: true });
  container.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return () => {
    unsubscribe();
    cancelAnimationFrame(resizeFrame);
    window.removeEventListener("keydown", onKeyDown, true);
    container.removeEventListener("wheel", onWheel);
    container.removeEventListener("touchstart", onTouchStart);
    container.removeEventListener("touchmove", onTouchMove);
    container.removeEventListener("touchend", onTouchEnd);
    container.removeEventListener("touchcancel", onTouchEnd);
  };
}

export function TerminalView({
  sessionId,
  active,
  visible,
  stickyMods = EMPTY_STICKY_MODS,
  onStickyConsumed,
  onReady,
  onCwdChange,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const webglRef = useRef<WebglAddon | null>(null);
  const activeRef = useRef(active);
  const visibleRef = useRef(visible);
  const stickyModsRef = useRef(stickyMods);
  const onStickyConsumedRef = useRef(onStickyConsumed);
  const onReadyRef = useRef(onReady);
  const onCwdChangeRef = useRef(onCwdChange);
  const lastCwdRef = useRef<string | null>(null);
  const forceFocusRef = useRef(false);
  // Drop click-through input (often Enter) when a UI click reveals this terminal.
  const ignoreInputUntilRef = useRef(0);
  const wasActiveVisibleRef = useRef(false);
  activeRef.current = active;
  visibleRef.current = visible;
  stickyModsRef.current = stickyMods;
  onStickyConsumedRef.current = onStickyConsumed;
  onReadyRef.current = onReady;
  onCwdChangeRef.current = onCwdChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: getTerminalFontSize(),
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
      if (event.type !== "keydown") return true;
      if (event.key === "Tab" && event.ctrlKey) return false;
      if (isNewShellShortcut(event) || isCloseTabShortcut(event)) return false;
      if (isFontZoomKey(event)) return false;

      const copyPasteChord =
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey;
      if (copyPasteChord && (event.key === "C" || event.key === "c")) {
        event.preventDefault();
        const text = term.getSelection();
        if (text) {
          void navigator.clipboard.writeText(text).catch(() => undefined);
        }
        return false;
      }
      if (copyPasteChord && (event.key === "V" || event.key === "v")) {
        event.preventDefault();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (!text) return;
            // Bypass click-through input guard for explicit paste.
            ignoreInputUntilRef.current = 0;
            term.paste(text);
          })
          .catch(() => undefined);
        return false;
      }

      return true;
    });
    webglRef.current = attachWebgl(term, null);
    fit.fit();
    void sshResize(sessionId, term.cols, term.rows);
    const detachMobileScroll = attachMobileScroll(
      term,
      containerRef.current,
      () => forceFocusRef.current,
      () => {
        forceFocusRef.current = false;
      },
    );
    const detachFontZoom = attachFontZoom(
      term,
      fit,
      sessionId,
      containerRef.current,
      () => activeRef.current && visibleRef.current,
    );

    const dataSub = term.onData((data) => {
      // Only drop accidental click-through Enter when a surface is revealed.
      // Never drop CSI/SS3 terminal replies (DA, DSR, …) — shells like fish
      // block startup until those answers arrive.
      if (performance.now() < ignoreInputUntilRef.current) {
        if (data === "\r" || data === "\n" || data === "\r\n") {
          return;
        }
      }
      const mods = stickyModsRef.current;
      let payload = data;
      if (hasStickyMods(mods)) {
        payload = applyStickyToInput(data, mods);
        onStickyConsumedRef.current?.();
      }
      void sshWrite(sessionId, payload);
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
    let lastViewportHeight =
      window.visualViewport?.height ?? window.innerHeight;
    const onViewportResize = () => {
      scheduleFit();
      const nextHeight = window.visualViewport?.height ?? window.innerHeight;
      // Height growth ≈ soft keyboard dismissed while the helper may stay focused.
      if (nextHeight > lastViewportHeight + 80) {
        forceFocusRef.current = true;
      }
      lastViewportHeight = nextHeight;
    };
    window.addEventListener("resize", onViewportResize);
    window.visualViewport?.addEventListener("resize", onViewportResize);

    termRef.current = term;
    fitRef.current = fit;
    lastCwdRef.current = null;
    const disposeApi = onReadyRef.current?.({
      write: (data) => {
        term.write(data);
      },
      send: (data) => {
        void sshWrite(sessionId, data);
      },
      focus: (options) => {
        focusTerminal(term, options);
      },
    });

    return () => {
      if (typeof disposeApi === "function") disposeApi();
      dataSub.dispose();
      osc7Sub.dispose();
      detachMobileScroll();
      detachFontZoom();
      ro.disconnect();
      cancelAnimationFrame(fitFrame);
      window.removeEventListener("resize", onViewportResize);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      try {
        webglRef.current?.dispose();
      } catch {
        // ignore
      }
      webglRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    const activeVisible = active && visible;
    const becameActiveVisible =
      activeVisible && !wasActiveVisibleRef.current;
    wasActiveVisibleRef.current = activeVisible;

    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    const element = containerRef.current;
    if (!term || !fit || !element) return;

    if (becameActiveVisible) {
      // Navigation clicks that reveal this surface must not reach the PTY.
      ignoreInputUntilRef.current = performance.now() + 300;
    }

    let frame = 0;
    let attempts = 0;
    let focusTimer = 0;
    const run = () => {
      // Parent may still be unlaid-out for a frame after becoming visible.
      if (
        element.clientWidth === 0 &&
        element.clientHeight === 0 &&
        attempts < 24
      ) {
        attempts += 1;
        frame = requestAnimationFrame(run);
        return;
      }
      restoreSurface(term, fit, sessionId);
      if (active) {
        // Defer past the activating pointer/click so it cannot type into xterm.
        focusTimer = window.setTimeout(() => {
          if (!activeRef.current || !visibleRef.current) return;
          focusTerminal(term, { force: forceFocusRef.current });
          forceFocusRef.current = false;
        }, becameActiveVisible ? 50 : 0);
      }
    };
    frame = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(focusTimer);
    };
  }, [active, visible, sessionId]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (!activeRef.current || !visibleRef.current) return;
        const term = termRef.current;
        const fit = fitRef.current;
        if (!term || !fit) return;
        requestAnimationFrame(() => {
          restoreSurface(term, fit, sessionId);
        });
      },
      { threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative min-h-0 min-w-0 overflow-hidden",
        active
          ? "flex-1"
          : "pointer-events-none absolute inset-0 opacity-0 [&_*]:pointer-events-none",
      )}
      aria-hidden={!active}
    />
  );
}
