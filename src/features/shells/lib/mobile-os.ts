import { useEffect, useState } from "react";

export function isMobileOs(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function useIsMobileOs(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobileOs());
  }, []);

  return mobile;
}
