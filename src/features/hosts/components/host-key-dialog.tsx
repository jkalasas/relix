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
import type { SshCommandError } from "@/features/ssh";
import { useMediaQuery } from "@/hooks/use-media-query";

type HostKeyDialogProps = {
  error: SshCommandError;
  onAccept: () => void;
  onCancel: () => void;
  busy?: boolean;
};

function HostKeyDetails({ error }: { error: SshCommandError }) {
  return (
    <dl className="space-y-1.5 font-mono text-[12px]">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Host</dt>
        <dd className="truncate text-foreground">
          {error.hostname}:{error.port}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Algorithm</dt>
        <dd className="truncate text-foreground">{error.algorithm}</dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-muted-foreground">Fingerprint</dt>
        <dd className="break-all text-foreground">{error.fingerprint}</dd>
      </div>
    </dl>
  );
}

function HostKeyActions({
  changed,
  busy,
  onCancel,
  onAccept,
}: {
  changed: boolean;
  busy?: boolean;
  onCancel: () => void;
  onAccept: () => void;
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
        size="sm"
        onClick={onAccept}
        disabled={busy}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        {changed ? "Replace and connect" : "Accept and connect"}
      </Button>
    </>
  );
}

export function HostKeyDialog({
  error,
  onAccept,
  onCancel,
  busy = false,
}: HostKeyDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const changed = error.code === "host_key_changed";
  const title = changed ? "Host key changed" : "Trust host key";
  const description = changed
    ? "The key for this host does not match the key stored in Relix. Someone could be intercepting the connection."
    : "This host has not been trusted yet. Verify the fingerprint before accepting.";

  const handleOpenChange = (open: boolean) => {
    if (!open && !busy) onCancel();
  };

  if (isDesktop) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <HostKeyDetails error={error} />
          <DialogFooter className="gap-2 sm:gap-2">
            <HostKeyActions
              changed={changed}
              busy={busy}
              onCancel={onCancel}
              onAccept={onAccept}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer
      open
      onOpenChange={handleOpenChange}
      swipeDirection="down"
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4">
          <HostKeyDetails error={error} />
        </div>
        <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <HostKeyActions
            changed={changed}
            busy={busy}
            onCancel={onCancel}
            onAccept={onAccept}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
