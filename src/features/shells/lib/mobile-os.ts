import { useEffect, useState } from "react";

/** True when the UA looks like a phone/tablet OS. */
export function isMobileOs(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** True when the primary input is touch-like (coarse pointer). */
export function hasCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: coarse)").matches;
}

/** True when the mobile terminal overlay (touch scroll, tap-click) should attach. */
export function shouldAttachTouchScroll(): boolean {
  return isTouchUi() || hasCoarsePointer();
}

/** True when the coarse-pointer/mobile layout is active. */
export function isTouchUi(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    return true;
  }
  return isMobileOs();
}

export function useIsMobileOs(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobileOs());
  }, []);

  return mobile;
}
