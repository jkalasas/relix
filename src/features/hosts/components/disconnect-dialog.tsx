import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";

export type DisconnectChoice = "disconnect" | "kill";

type DisconnectDialogProps = {
  open: boolean;
  sessionName: string;
  busy?: boolean;
  title?: string;
  description?: ReactNode;
  leaveLabel?: string;
  killLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: DisconnectChoice) => void;
};

function DisconnectActions({
  busy,
  leaveLabel,
  killLabel,
  onCancel,
  onConfirm,
}: {
  busy?: boolean;
  leaveLabel: string;
  killLabel: string;
  onCancel: () => void;
  onConfirm: (choice: DisconnectChoice) => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCancel}
        disabled={busy}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onConfirm("disconnect")}
        disabled={busy}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        {leaveLabel}
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => onConfirm("kill")}
        disabled={busy}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        {killLabel}
      </Button>
    </>
  );
}

export function DisconnectDialog({
  open,
  sessionName,
  busy = false,
  title = "Disconnect host?",
  description,
  leaveLabel = "Disconnect",
  killLabel = "Kill sessions",
  onOpenChange,
  onConfirm,
}: DisconnectDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const resolvedDescription = description ?? (
    <>
      Leave Relix tmux sessions under base{" "}
      <span className="font-mono text-foreground">{sessionName}</span>{" "}
      running (ad hoc and project sessions), or kill them and destroy every
      window.
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{resolvedDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DisconnectActions
              busy={busy}
              leaveLabel={leaveLabel}
              killLabel={killLabel}
              onCancel={() => onOpenChange(false)}
              onConfirm={onConfirm}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection="down"
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{resolvedDescription}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DisconnectActions
            busy={busy}
            leaveLabel={leaveLabel}
            killLabel={killLabel}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
