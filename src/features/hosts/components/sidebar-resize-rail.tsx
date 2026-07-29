import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/hooks/use-sidebar-width";

type SidebarResizeRailProps = {
  widthPx: number;
  onWidthChange: (px: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (px: number) => void;
  className?: string;
};

export function SidebarResizeRail({
  widthPx,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  className,
}: SidebarResizeRailProps) {
  const { state, toggleSidebar } = useSidebar();
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startWidth: 0,
    lastWidth: widthPx,
  });
  const suppressClick = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (state === "collapsed") return;

    event.preventDefault();
    drag.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startWidth: widthPx,
      lastWidth: widthPx,
    };
    onResizeStart();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;

    const delta = event.clientX - drag.current.startX;
    if (Math.abs(delta) > 3) {
      drag.current.moved = true;
    }

    const next = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.round(drag.current.startWidth + delta)),
    );
    drag.current.lastWidth = next;
    onWidthChange(next);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;

    drag.current.active = false;
    suppressClick.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const moved = drag.current.moved;
    onResizeEnd(drag.current.lastWidth);

    if (!moved) {
      toggleSidebar();
    }
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (state === "collapsed") {
      toggleSidebar();
    }
  };

  return (
    <button
      type="button"
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label={state === "collapsed" ? "Expand sidebar" : "Resize sidebar"}
      title={state === "collapsed" ? "Expand sidebar" : "Drag to resize"}
      tabIndex={-1}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        "touch-none select-none",
        className,
      )}
    />
  );
}
