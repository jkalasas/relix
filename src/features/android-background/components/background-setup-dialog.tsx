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
import type { BackgroundReadiness } from "@/features/android-background/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type BackgroundSetupDialogProps = {
  open: boolean;
  readiness: BackgroundReadiness;
  busy?: boolean;
  onEnable: () => void;
  onOpenSettings: () => void;
};

function ChecklistRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span
        className={cn(
          "inline-block size-2 shrink-0 rounded-full",
          ok ? "bg-status-connected" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
          {ok ? "ok" : "required"}
        </span>
      </span>
    </div>
  );
}

function BackgroundChecklist({ readiness }: { readiness: BackgroundReadiness }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-3">
      <ChecklistRow
        label="Notifications"
        ok={readiness.notificationsGranted}
      />
      <ChecklistRow
        label="Unrestricted battery"
        ok={readiness.batteryUnrestricted}
      />
    </div>
  );
}

function BackgroundActions({
  busy,
  onEnable,
  onOpenSettings,
}: {
  busy?: boolean;
  onEnable: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={onEnable}
        disabled={busy}
        className="min-h-11 w-full md:min-h-7"
      >
        {busy ? "Waiting for system…" : "Enable background"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenSettings}
        disabled={busy}
        className="min-h-11 w-full md:min-h-7"
      >
        Open battery settings
      </Button>
    </>
  );
}

export function BackgroundSetupDialog({
  open,
  readiness,
  busy = false,
  onEnable,
  onOpenSettings,
}: BackgroundSetupDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const title = "Background usage required";
  const description = (
    <>
      Android freezes or kills apps that leave the screen. Relix holds SSH
      sessions, tunnels, and SFTP in memory. Without unrestricted background
      access, those links die at random.
    </>
  );
  const detail = (
    <>
      While a host is connected, Relix shows a persistent notification so Android
      keeps the process alive. Use{" "}
      <span className="font-mono text-foreground">Stop</span> on that
      notification to end every session.
    </>
  );

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onOpenChange={() => {}}
        disablePointerDismissal
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {detail}
          </p>
          <BackgroundChecklist readiness={readiness} />
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:justify-stretch">
            <BackgroundActions
              busy={busy}
              onEnable={onEnable}
              onOpenSettings={onOpenSettings}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={() => {}}
      disablePointerDismissal
      swipeDirection="down"
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 px-4">
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {detail}
          </p>
          <BackgroundChecklist readiness={readiness} />
        </div>
        <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <BackgroundActions
            busy={busy}
            onEnable={onEnable}
            onOpenSettings={onOpenSettings}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
