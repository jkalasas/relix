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

type FileDiscardDialogProps = {
  open: boolean;
  fileName: string;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
};

function DiscardActions({
  onCancel,
  onDiscard,
}: {
  onCancel: () => void;
  onDiscard: () => void;
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
        Keep editing
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onDiscard}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        Discard
      </Button>
    </>
  );
}

export function FileDiscardDialog({
  open,
  fileName,
  onOpenChange,
  onDiscard,
}: FileDiscardDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const title = "Discard changes?";
  const description = (
    <>
      Unsaved edits to{" "}
      <span className="font-mono text-foreground">{fileName}</span> will be
      lost.
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DiscardActions
              onCancel={() => onOpenChange(false)}
              onDiscard={onDiscard}
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
          <DiscardActions
            onCancel={() => onOpenChange(false)}
            onDiscard={onDiscard}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
