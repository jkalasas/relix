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
import type { SftpEntry } from "@/features/ssh";
import { useMediaQuery } from "@/hooks/use-media-query";

type SftpDeleteDialogProps = {
  entry: SftpEntry | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

function DeleteActions({
  busy,
  onCancel,
  onConfirm,
}: {
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
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
        variant="destructive"
        size="sm"
        onClick={onConfirm}
        disabled={busy}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        Delete
      </Button>
    </>
  );
}

export function SftpDeleteDialog({
  entry,
  busy = false,
  onOpenChange,
  onConfirm,
}: SftpDeleteDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const open = entry != null;
  const label = entry?.isDir ? "directory" : "file";
  const title = `Delete ${label}?`;
  const description = entry ? (
    <>
      This removes{" "}
      <span className="font-mono text-foreground">{entry.name}</span> on the
      remote host. This cannot be undone.
    </>
  ) : null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DeleteActions
              busy={busy}
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
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DeleteActions
            busy={busy}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
