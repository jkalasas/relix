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

type ShellCloseDialogProps = {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

function CloseActions({
  onCancel,
  onConfirm,
}: {
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
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onConfirm}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        Close shell
      </Button>
    </>
  );
}

export function ShellCloseDialog({
  open,
  title,
  onOpenChange,
  onConfirm,
}: ShellCloseDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const dialogTitle = "Close shell?";
  const description = (
    <>
      Closing{" "}
      <span className="font-mono text-foreground">{title || "shell"}</span> will
      end this session.
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <CloseActions
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
          <DrawerTitle>{dialogTitle}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <CloseActions
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
