import { useEffect } from "react";
import { createPortal } from "react-dom";

export type WorktreeRowMenuState = {
  label: string;
  sub: string;
  x: number;
  y: number;
};

type WorktreeRowMenuProps = {
  menu: WorktreeRowMenuState | null;
  onClose: () => void;
  onOpen: () => void;
};

/** Desktop right-click menu for a worktree row (mobile keeps tap-to-switch). */
export function WorktreeRowMenu({ menu, onClose, onOpen }: WorktreeRowMenuProps) {
  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-worktree-row-menu]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div
      data-worktree-row-menu=""
      role="menu"
      className="fixed z-50 min-w-48 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={{
        left: Math.min(menu.x, window.innerWidth - 220),
        top: Math.min(menu.y, window.innerHeight - 120),
      }}
    >
      <p
        className="truncate px-1.5 pt-1.5 pb-0.5 font-mono text-[11px] text-muted-foreground"
        title={menu.sub}
      >
        {menu.label}
      </p>
      <button
        type="button"
        role="menuitem"
        className="flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
        onClick={onOpen}
      >
        Open in new window
      </button>
    </div>,
    document.body,
  );
}
