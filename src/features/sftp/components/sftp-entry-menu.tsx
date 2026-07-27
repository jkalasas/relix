import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { SftpEntry } from "@/features/ssh";
import { useMediaQuery } from "@/hooks/use-media-query";

export type SftpEntryAction = "view" | "open" | "rename" | "download" | "delete";

export type SftpEntryMenuState = {
  entry: SftpEntry;
  x: number;
  y: number;
};

type SftpEntryMenuProps = {
  menu: SftpEntryMenuState | null;
  busy?: boolean;
  onClose: () => void;
  onAction: (action: SftpEntryAction, entry: SftpEntry) => void;
};

function menuItems(entry: SftpEntry): Array<{
  action: SftpEntryAction;
  label: string;
  destructive?: boolean;
}> {
  if (entry.isDir) {
    return [
      { action: "open", label: "Open" },
      { action: "rename", label: "Rename" },
      { action: "delete", label: "Delete", destructive: true },
    ];
  }
  return [
    { action: "view", label: "View" },
    { action: "rename", label: "Rename" },
    { action: "download", label: "Download" },
    { action: "delete", label: "Delete", destructive: true },
  ];
}

export function SftpEntryMenu({
  menu,
  busy = false,
  onClose,
  onAction,
}: SftpEntryMenuProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const entry = menu?.entry ?? null;
  const items = entry ? menuItems(entry) : [];

  useEffect(() => {
    if (!menu || !isDesktop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-sftp-entry-menu]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [isDesktop, menu, onClose]);

  if (!menu || !entry) return null;

  if (isDesktop) {
    return createPortal(
      <div
        data-sftp-entry-menu=""
        role="menu"
        className="fixed z-50 min-w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        style={{
          left: Math.min(menu.x, window.innerWidth - 180),
          top: Math.min(menu.y, window.innerHeight - 180),
        }}
      >
        {items.map((item) => (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            disabled={busy}
            className={
              item.destructive
                ? "flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-left text-sm text-destructive outline-hidden select-none hover:bg-destructive/10 disabled:opacity-50"
                : "flex w-full cursor-default items-center rounded-md px-1.5 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            }
            onClick={() => {
              onAction(item.action, entry);
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>,
      document.body,
    );
  }

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      swipeDirection="down"
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-mono text-sm">{entry.name}</DrawerTitle>
        </DrawerHeader>
        <DrawerFooter className="gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {items.map((item) => (
            <Button
              key={item.action}
              type="button"
              variant={item.destructive ? "destructive" : "outline"}
              size="sm"
              disabled={busy}
              className="min-h-11 w-full"
              onClick={() => {
                onAction(item.action, entry);
                onClose();
              }}
            >
              {item.label}
            </Button>
          ))}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
