import {
  BackgroundSetupDialog,
  type BackgroundReadiness,
} from "@/features/android-background";
import { FileDiscardDialog } from "@/features/files";
import {
  AuthCheckDialog,
  DisconnectDialog,
  HostKeyDialog,
  type AuthCheckPrompt,
  type DisconnectChoice,
} from "@/features/hosts";
import { DEFAULT_TMUX_SESSION, ShellCloseDialog } from "@/features/shells";
import type { SshCommandError } from "@/features/ssh";

type AppDialogsProps = {
  hostKeyError: SshCommandError | null;
  hostKeyBusy: boolean;
  onAcceptHostKey: () => void;
  onCancelHostKey: () => void;
  authCheck: AuthCheckPrompt | null;
  authCheckBusy: boolean;
  onCancelAuthCheck: () => void;
  disconnectPrompt: { hostId: string; sessionName: string } | null;
  disconnectBusy: boolean;
  onClearDisconnect: () => void;
  onConfirmDisconnect: (choice: DisconnectChoice) => void;
  quitPrompt: { sessionName: string } | null;
  quitBusy: boolean;
  onClearQuit: () => void;
  onConfirmQuit: (choice: DisconnectChoice) => void;
  discardTarget: { fileName: string } | null;
  onClearDiscard: () => void;
  onConfirmDiscard: () => void;
  shellCloseTarget: { title: string } | null;
  onClearShellClose: () => void;
  onConfirmShellClose: () => void;
  backgroundSetupOpen: boolean;
  backgroundReadiness: BackgroundReadiness;
  backgroundBusy: boolean;
  onEnableBackground: () => void;
  onOpenBatterySettings: () => void;
};

export function AppDialogs({
  hostKeyError,
  hostKeyBusy,
  onAcceptHostKey,
  onCancelHostKey,
  authCheck,
  authCheckBusy,
  onCancelAuthCheck,
  disconnectPrompt,
  disconnectBusy,
  onClearDisconnect,
  onConfirmDisconnect,
  quitPrompt,
  quitBusy,
  onClearQuit,
  onConfirmQuit,
  discardTarget,
  onClearDiscard,
  onConfirmDiscard,
  shellCloseTarget,
  onClearShellClose,
  onConfirmShellClose,
  backgroundSetupOpen,
  backgroundReadiness,
  backgroundBusy,
  onEnableBackground,
  onOpenBatterySettings,
}: AppDialogsProps) {
  return (
    <>
      {hostKeyError ? (
        <HostKeyDialog
          error={hostKeyError}
          busy={hostKeyBusy}
          onAccept={() => void onAcceptHostKey()}
          onCancel={onCancelHostKey}
        />
      ) : null}

      {authCheck ? (
        <AuthCheckDialog
          prompt={authCheck}
          busy={authCheckBusy}
          onCancel={() => void onCancelAuthCheck()}
        />
      ) : null}

      <DisconnectDialog
        open={disconnectPrompt != null}
        sessionName={disconnectPrompt?.sessionName ?? DEFAULT_TMUX_SESSION}
        busy={disconnectBusy}
        onOpenChange={(open) => {
          if (!open && !disconnectBusy) onClearDisconnect();
        }}
        onConfirm={(choice) => void onConfirmDisconnect(choice)}
      />

      <DisconnectDialog
        open={quitPrompt != null}
        sessionName={quitPrompt?.sessionName ?? DEFAULT_TMUX_SESSION}
        busy={quitBusy}
        title="Quit Relix?"
        description={
          <>
            Leave local Relix tmux sessions under base{" "}
            <span className="font-mono text-foreground">
              {quitPrompt?.sessionName ?? DEFAULT_TMUX_SESSION}
            </span>{" "}
            running (ad hoc and project sessions), or kill them and destroy every
            window.
          </>
        }
        leaveLabel="Quit"
        killLabel="Kill sessions"
        onOpenChange={(open) => {
          if (!open && !quitBusy) onClearQuit();
        }}
        onConfirm={(choice) => void onConfirmQuit(choice)}
      />

      <FileDiscardDialog
        open={discardTarget != null}
        fileName={discardTarget?.fileName ?? ""}
        onOpenChange={(open) => {
          if (!open) onClearDiscard();
        }}
        onDiscard={onConfirmDiscard}
      />

      <ShellCloseDialog
        open={shellCloseTarget != null}
        title={shellCloseTarget?.title ?? ""}
        onOpenChange={(open) => {
          if (!open) onClearShellClose();
        }}
        onConfirm={onConfirmShellClose}
      />

      <BackgroundSetupDialog
        open={backgroundSetupOpen}
        readiness={backgroundReadiness}
        busy={backgroundBusy}
        onEnable={() => void onEnableBackground()}
        onOpenSettings={() => void onOpenBatterySettings()}
      />
    </>
  );
}
