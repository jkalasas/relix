import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";

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

export function AuthCheckDialog({
  prompt,
  busy = false,
  onCancel,
}: AuthCheckDialogProps) {
  const openCheck = () => {
    if (!prompt.checkUrl) return;
    void openUrl(prompt.checkUrl);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-check-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-elevated p-4 shadow-lg">
        <h2 id="auth-check-title" className="text-sm font-semibold">
          Tailscale SSH check
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Approve this session in the browser, then wait here. Relix will finish
          connecting once Tailscale accepts it.
        </p>
        {prompt.message.trim() ? (
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-[12px] text-foreground">
            {prompt.message.trim()}
          </pre>
        ) : null}
        {prompt.checkUrl ? (
          <p className="mt-2 break-all font-mono text-[12px] text-primary">
            {prompt.checkUrl}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            className="min-h-9 px-3 md:min-h-7"
          >
            Cancel
          </Button>
          {prompt.checkUrl ? (
            <Button
              type="button"
              size="sm"
              onClick={openCheck}
              className="min-h-9 px-3 md:min-h-7"
            >
              Open check URL
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
