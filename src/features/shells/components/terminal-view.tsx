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
import { isTouchUi, shouldAttachTouchScroll } from "@/features/shells/lib/mobile-os";
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

type TerminalSize = { cols: number; rows: number };

/**
 * Send ssh_resize only when cols/rows actually changed. Tab reveals call
 * fit() with an identical size; without this guard every reveal sends
 * SIGWINCH and fish repaints its prompt over the refreshed buffer.
 */
function sendResizeIfChanged(
  term: Terminal,
  sessionId: string,
  lastSent: { current: TerminalSize | null },
): boolean {
  const cols = term.cols;
  const rows = term.rows;
  const prev = lastSent.current;
  if (prev && prev.cols === cols && prev.rows === rows) return false;
  lastSent.current = { cols, rows };
  void sshResize(sessionId, cols, rows);
  return true;
}

/**
 * Refit after a reveal/resize. Refreshes the canvas only when the size
 * actually changed, so a same-size tab switch never disturbs the shell.
 */
function restoreSurface(
  term: Terminal,
  fit: FitAddon,
  sessionId: string,
  lastSent: { current: TerminalSize | null },
) {
  fit.fit();
  if (!sendResizeIfChanged(term, sessionId, lastSent)) return;
  term.refresh(0, Math.max(0, term.rows - 1));
}

/**
 * Apply a font-size change, resizing the PTY only if the grid changed.
 */
function applyFontSize(
  term: Terminal,
  fit: FitAddon,
  sessionId: string,
  size: number,
  lastSent: { current: TerminalSize | null },
) {
  term.options.fontSize = size;
  fit.fit();
  sendResizeIfChanged(term, sessionId, lastSent);
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
  // Attach for touch-driven UI, not just mobile UAs: a narrow desktop
  // browser shows the mobile layout but fails the UA sniff. Coarse
  // pointer (not mere touch capability) so touch-laptops using a mouse
  // keep native text selection instead of hitting the overlay.
  if (!shouldAttachTouchScroll()) return () => {};

  const layer = document.createElement("div");
  layer.className = "xterm-mobile-scroll";
  layer.setAttribute("aria-hidden", "true");
  container.appendChild(layer);

  const dragThresholdPx = 10;
  const flingMinVelocityPxPerMs = 0.25;
  const flingStopVelocityPxPerMs = 0.02;
  const flingTimeConstantMs = 180;
  let tracking = false;
  let scrolling = false;
  let startY = 0;
  let lastY = 0;
  let remainder = 0;
  let pendingDelta = 0;
  let scrollFrame = 0;
  let flingFrame = 0;
  let flingVelocity = 0;
  let lastFlingTime = 0;
  let samples: Array<{ y: number; t: number }> = [];

  let pinching = false;
  let pinchStartDistance = 0;
  let pinchStartFontSize = getTerminalFontSize();
  let pinchFrame = 0;
  let pendingPinchSize: number | null = null;

  const readViewportY = (): number | null => {
    try {
      return term.buffer.active.viewportY;
    } catch {
      return null;
    }
  };

  /**
   * Forward a drag as a wheel event so mouse-aware apps (tmux with
   * `mouse on`, vim, less) scroll their own viewport. Direct
   * `scrollLines` cannot move those: tmux owns the scrollback and the
   * xterm viewport stays put.
   */
  const dispatchWheelFallback = (deltaYPx: number) => {
    const scrollTarget =
      term.element?.querySelector(".xterm-scrollable-element") ??
      term.element;
    if (!scrollTarget) return;
    scrollTarget.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -deltaYPx,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  /**
   * Replay a tap as a mouse click at the tap point so mouse-aware apps
   * (tmux panes, TUI buttons, vim) receive it. The overlay shields xterm
   * from real events, so a synthetic down/up pair is dispatched straight
   * at the xterm element. Skipped when text is selected so a focus tap
   * never wipes a selection the user wants to copy.
   */
  const forwardTapAsClick = (clientX: number, clientY: number) => {
    if (term.getSelection()) return;
    const target = term.element;
    if (!target) return;
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
    };
    target.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
    target.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
  };

  let lastTapForwardMs = 0;

  const applyLines = (deltaY: number) => {
    const linePx = cellHeightPx(term, container);
    remainder += deltaY;
    const lines = Math.trunc(remainder / linePx);
    if (lines === 0) return;
    remainder -= lines * linePx;
    const before = readViewportY();
    term.scrollLines(-lines);
    const after = readViewportY();
    if (before == null || after == null || before !== after) return;
    // tmux/fullscreen: the xterm viewport is static, so replay one wheel
    // tick per line of finger travel. Mouse protocol counts ticks and
    // ignores pixel magnitude — a single tick per frame crawls.
    const ticks = Math.min(100, Math.abs(lines));
    const tickDelta = Math.sign(deltaY) * linePx;
    for (let i = 0; i < ticks; i += 1) {
      dispatchWheelFallback(tickDelta);
    }
  };

  const flushPending = () => {
    scrollFrame = 0;
    if (pendingDelta === 0) return;
    const delta = pendingDelta;
    pendingDelta = 0;
    applyLines(delta);
  };

  const scheduleFlush = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(flushPending);
  };

  const cancelFling = () => {
    cancelAnimationFrame(flingFrame);
    flingFrame = 0;
    flingVelocity = 0;
  };

  const stepFling = (now: number) => {
    flingFrame = 0;
    const dt = Math.min(50, Math.max(1, now - lastFlingTime));
    lastFlingTime = now;
    const dy = flingVelocity * dt;
    flingVelocity *= Math.exp(-dt / flingTimeConstantMs);
    if (Math.abs(flingVelocity) < flingStopVelocityPxPerMs) {
      cancelFling();
      return;
    }
    // Wheel fallback (tmux copy-mode, vim, less) keeps consuming the fling
    // even when the xterm viewport is static, so fling ends on velocity
    // decay rather than viewport-stuck. Extra events at buffer limits
    // are harmless no-ops.
    applyLines(dy);
    flingFrame = requestAnimationFrame(stepFling);
  };

  const startFling = (velocity: number) => {
    cancelFling();
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    }
    if (pendingDelta !== 0) {
      applyLines(pendingDelta);
      pendingDelta = 0;
    }
    flingVelocity = velocity;
    lastFlingTime = performance.now();
    flingFrame = requestAnimationFrame(stepFling);
  };

  const flushPinch = () => {
    pinchFrame = 0;
    if (pendingPinchSize == null) return;
    setTerminalFontSize(pendingPinchSize);
    pendingPinchSize = null;
  };

  const onTouchStart = (event: TouchEvent) => {
    cancelFling();
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    }
    pendingDelta = 0;
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
    samples = [{ y: startY, t: performance.now() }];
  };

  const onTouchMove = (event: TouchEvent) => {
    if (pinching && event.touches.length === 2) {
      const distance = touchDistance(event.touches[0], event.touches[1]);
      if (pinchStartDistance > 0) {
        pendingPinchSize = pinchStartFontSize * (distance / pinchStartDistance);
        if (!pinchFrame) pinchFrame = requestAnimationFrame(flushPinch);
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
    pendingDelta += delta;
    scheduleFlush();
    const now = performance.now();
    samples.push({ y, t: now });
    while (samples.length > 6) samples.shift();
    while (
      samples.length > 2 &&
      now - samples[0].t > 120
    ) {
      samples.shift();
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (pinching) {
      if (event.touches.length < 2) {
        pinching = false;
        pinchStartDistance = 0;
        if (pinchFrame) {
          cancelAnimationFrame(pinchFrame);
          pinchFrame = 0;
        }
        if (pendingPinchSize != null) {
          setTerminalFontSize(pendingPinchSize);
          pendingPinchSize = null;
        }
      }
      return;
    }

    if (!tracking) return;
    const wasTap = !scrolling;
    tracking = false;
    scrolling = false;
    remainder = 0;
    if (!wasTap) {
      const last = samples[samples.length - 1];
      const first = samples[0];
      if (last && first && last.t > first.t) {
        const velocity = (last.y - first.y) / (last.t - first.t);
        if (Math.abs(velocity) >= flingMinVelocityPxPerMs) {
          startFling(velocity);
          samples = [];
          return;
        }
      }
      samples = [];
      return;
    }
    samples = [];

    if (event.type === "touchend") {
      const touch = event.changedTouches[0];
      if (touch) {
        forwardTapAsClick(touch.clientX, touch.clientY);
        lastTapForwardMs = performance.now();
      }
    }
    const force = shouldForceFocus();
    focusTerminal(term, { force });
    clearForceFocus();
  };

  const onClick = (event: MouseEvent) => {
    // A real mouse click (e.g. bluetooth mouse) also needs forwarding,
    // but skip the browser-synthesized click that follows a touch tap —
    // it would double-send the click into the TUI.
    if (performance.now() - lastTapForwardMs > 500) {
      forwardTapAsClick(event.clientX, event.clientY);
    }
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
    cancelFling();
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(pinchFrame);
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
  lastSent: { current: TerminalSize | null },
): () => void {
  let resizeFrame = 0;
  let pendingSize: number | null = null;

  const flushFontSize = (size: number) => {
    pendingSize = size;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (pendingSize == null) return;
      applyFontSize(term, fit, sessionId, pendingSize, lastSent);
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
  const lastSentSizeRef = useRef<TerminalSize | null>(null);
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

    const touch = isTouchUi();
    const term = new Terminal({
      cursorBlink: !touch,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: getTerminalFontSize(),
      lineHeight: 1.3,
      scrollback: touch ? 1000 : 5000,
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
    lastSentSizeRef.current = null;
    fit.fit();
    sendResizeIfChanged(term, sessionId, lastSentSizeRef);
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
      lastSentSizeRef,
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
      if (!visibleRef.current || !activeRef.current) return;
      if (containerRef.current?.offsetParent === null) return;
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(() => {
        fit.fit();
        sendResizeIfChanged(term, sessionId, lastSentSizeRef);
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
      restoreSurface(term, fit, sessionId, lastSentSizeRef);
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

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative min-h-0 min-w-0 overflow-hidden",
        active ? "flex-1" : "hidden",
      )}
      aria-hidden={!active}
    />
  );
}
