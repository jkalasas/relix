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
import { Progress } from "@/components/ui/progress";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatTransferBytes } from "@/features/clipboard/lib/format-bytes";
import type { ClipboardUploadState } from "@/features/clipboard/types";

type ClipboardUploadDialogProps = {
  upload: ClipboardUploadState | null;
  onCancel: () => void;
  onDismiss: () => void;
};

function uploadPercent(upload: ClipboardUploadState): number {
  if (upload.bytesTotal <= 0) return 0;
  return Math.min(100, Math.round((upload.bytesSent / upload.bytesTotal) * 100));
}

function UploadBody({ upload }: { upload: ClipboardUploadState }) {
  if (upload.status === "error") {
    return (
      <p className="text-sm text-destructive">
        {upload.error ?? "Upload failed."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Progress value={uploadPercent(upload)} />
      <p className="text-xs text-muted-foreground">
        {formatTransferBytes(upload.bytesSent)} of{" "}
        {formatTransferBytes(upload.bytesTotal)}
      </p>
    </div>
  );
}

function UploadActions({
  upload,
  onCancel,
  onDismiss,
}: {
  upload: ClipboardUploadState;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  if (upload.status === "error") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDismiss}
        className="min-h-11 w-full md:min-h-7 md:w-auto"
      >
        Dismiss
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onCancel}
      className="min-h-11 w-full md:min-h-7 md:w-auto"
    >
      Cancel upload
    </Button>
  );
}

function uploadDescription(upload: ClipboardUploadState) {
  const counter =
    upload.total > 1 ? (
      <>
        {" "}
        (file {upload.index} of {upload.total})
      </>
    ) : null;
  return (
    <>
      Staging{" "}
      <span className="font-mono text-foreground">{upload.fileName}</span>
      {counter} to <span className="font-mono">/tmp/relix-clipboard</span>.
    </>
  );
}

/**
 * Blocking modal shown while pasted files upload to the remote host.
 * Input stays trapped here until the upload finishes or fails.
 */
export function ClipboardUploadDialog({
  upload,
  onCancel,
  onDismiss,
}: ClipboardUploadDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const open = upload != null;
  const uploading = upload?.status === "uploading";

  const keepOpen = (next: boolean) => {
    if (next) return;
    if (uploading) return;
    onDismiss();
  };

  if (!upload) return null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={keepOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {uploading ? "Uploading files…" : "Upload failed"}
            </DialogTitle>
            <DialogDescription>{uploadDescription(upload)}</DialogDescription>
          </DialogHeader>
          <UploadBody upload={upload} />
          <DialogFooter className="gap-2 sm:gap-2">
            <UploadActions
              upload={upload}
              onCancel={onCancel}
              onDismiss={onDismiss}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={keepOpen}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>
            {uploading ? "Uploading files…" : "Upload failed"}
          </DrawerTitle>
          <DrawerDescription>{uploadDescription(upload)}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4">
          <UploadBody upload={upload} />
        </div>
        <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <UploadActions
            upload={upload}
            onCancel={onCancel}
            onDismiss={onDismiss}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
