import { useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { NotificationItem } from "@/features/notify/lib/notification-items";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export type NotificationBellProps = {
  items: NotificationItem[];
  count: number;
  onOpen: (item: NotificationItem) => void;
  onDismiss: (tabId: string) => void;
  onClearAll: () => void;
  variant?: "default" | "titlebar";
  className?: string;
};

function BellButton({
  count,
  titlebar,
  onClick,
  className,
}: {
  count: number;
  titlebar: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={
        count > 0
          ? `Notifications, ${count} needing attention`
          : "Notifications, none"
      }
      className={cn(
        "relative text-muted-foreground hover:text-foreground",
        titlebar ? "size-7" : "size-9 md:size-7",
        className,
      )}
    >
      <Bell className="size-3.5" />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-none font-medium text-primary-foreground"
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Button>
  );
}

function NotificationRows({
  items,
  onOpen,
  onDismiss,
  compact,
}: Pick<NotificationBellProps, "items" | "onOpen" | "onDismiss"> & {
  compact?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-[13px] text-muted-foreground">
        No notifications. Host processes can page a tab via relix-notify.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Tabs needing attention">
      {items.map((item) => (
        <li
          key={item.tabId}
          className="group flex items-stretch gap-0.5 rounded-md hover:bg-elevated"
        >
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              compact ? "py-2" : "min-h-11 justify-center py-2",
            )}
          >
            <span className="w-full truncate text-[13px] font-medium text-foreground">
              {item.title}
            </span>
            {item.body ? (
              <span className="w-full truncate text-[12px] text-muted-foreground">
                {item.body}
              </span>
            ) : null}
            <span className="w-full truncate font-mono text-[11px] text-muted-foreground">
              {item.tabLabel} · {item.hostName} · {item.scopeName}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss notification for ${item.tabLabel}`}
            onClick={() => onDismiss(item.tabId)}
            className={cn(
              "shrink-0 self-center text-muted-foreground hover:text-foreground",
              compact ? "size-7" : "size-9",
            )}
          >
            <X className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ClearAll({
  onClearAll,
  compact,
}: Pick<NotificationBellProps, "onClearAll"> & { compact?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClearAll}
      className={cn(
        "w-full text-muted-foreground hover:text-foreground",
        compact ? "h-8 text-[12px]" : "min-h-11",
      )}
    >
      Clear all
    </Button>
  );
}

export function NotificationBell({
  items,
  count,
  onOpen,
  onDismiss,
  onClearAll,
  variant = "default",
  className,
}: NotificationBellProps) {
  const titlebar = variant === "titlebar";
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);

  const handleOpen = (item: NotificationItem) => {
    setOpen(false);
    onOpen(item);
  };

  if (!isDesktop) {
    return (
      <>
        <span className={cn("relative z-30 shrink-0", className)}>
          <BellButton
            count={count}
            titlebar={false}
            onClick={() => setOpen(true)}
          />
        </span>
        <Drawer
          open={open}
          onOpenChange={setOpen}
          swipeDirection="down"
          showSwipeHandle
        >
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle>Notifications</DrawerTitle>
            </DrawerHeader>
            <div className="max-h-[min(60dvh,24rem)] overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <NotificationRows
                items={items}
                onOpen={handleOpen}
                onDismiss={onDismiss}
              />
              {items.length > 0 ? <ClearAll onClearAll={onClearAll} /> : null}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <BellButton
            count={count}
            titlebar={titlebar}
            className={cn("relative z-30 shrink-0", className)}
          />
        }
      />
      <PopoverContent align="end" sideOffset={8} className="w-80">
        <div className="max-h-80 overflow-y-auto">
          <NotificationRows
            items={items}
            onOpen={handleOpen}
            onDismiss={onDismiss}
            compact
          />
        </div>
        {items.length > 0 ? (
          <ClearAll onClearAll={onClearAll} compact />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
