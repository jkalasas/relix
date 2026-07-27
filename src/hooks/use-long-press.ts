import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

const LONG_PRESS_MS = 480;
const MOVE_THRESHOLD_PX = 10;

type LongPressHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  suppressClick: () => boolean;
};

export function useLongPress(
  onLongPress: (point: { x: number; y: number }) => void,
  enabled = true,
): LongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const pointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      clearTimer();
      pointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      timerRef.current = window.setTimeout(() => {
        const pointer = pointerRef.current;
        if (!pointer) return;
        pointerRef.current = null;
        suppressClickRef.current = true;
        onLongPressRef.current({ x: pointer.startX, y: pointer.startY });
      }, LONG_PRESS_MS);
    },
    [clearTimer, enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      const dx = event.clientX - pointer.startX;
      const dy = event.clientY - pointer.startY;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
        pointerRef.current = null;
        clearTimer();
      }
    },
    [clearTimer],
  );

  const endPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      pointerRef.current = null;
      clearTimer();
    },
    [clearTimer],
  );

  const suppressClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    suppressClick,
  };
}
