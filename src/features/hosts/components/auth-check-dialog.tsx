import { openUrl } from "@tauri-apps/plugin-opener";
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

export type AuthCheckPrompt = {
  hostId: string;
  message: string;
  checkUrl?: string;
};

type AuthCheckDialogProps = {
  prompt: AuthCheckPrompt;
  busy?: boolean;
  onCancel: () => void;
};

function AuthCheckBody({ prompt }: { prompt: AuthCheckPrompt }) {
  return (
    <div className="space-y-2">
      {prompt.message.trim() ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-[12px] text-foreground">
          {prompt.message.trim()}
        </pre>
      ) : null}
      {prompt.checkUrl ? (
        <p className="break-all font-mono text-[12px] text-primary">
          {prompt.checkUrl}
        </p>
      ) : null}
    </div>
  );
}

function AuthCheckActions({
  checkUrl,
  busy,
  onCancel,
  onOpenCheck,
}: {
  checkUrl?: string;
  busy?: boolean;
  onCancel: () => void;
  onOpenCheck: () => void;
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
      {checkUrl ? (
        <Button
          type="button"
          size="sm"
          onClick={onOpenCheck}
          className="min-h-11 w-full md:min-h-7 md:w-auto"
        >
          Open check URL
        </Button>
      ) : null}
    </>
  );
}

export function AuthCheckDialog({
  prompt,
  busy = false,
  onCancel,
}: AuthCheckDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const title = "Tailscale SSH check";
  const description =
    "Approve this session in the browser, then wait here. Relix will finish connecting once Tailscale accepts it.";

  const openCheck = () => {
    if (!prompt.checkUrl) return;
    void openUrl(prompt.checkUrl);
  };

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
          <AuthCheckBody prompt={prompt} />
          <DialogFooter className="gap-2 sm:gap-2">
            <AuthCheckActions
              checkUrl={prompt.checkUrl}
              busy={busy}
              onCancel={onCancel}
              onOpenCheck={openCheck}
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
          <AuthCheckBody prompt={prompt} />
        </div>
        <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <AuthCheckActions
            checkUrl={prompt.checkUrl}
            busy={busy}
            onCancel={onCancel}
            onOpenCheck={openCheck}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
