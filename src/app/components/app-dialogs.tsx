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
import { DEFAULT_TMUX_SESSION } from "@/features/shells";
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
  discardTarget: { fileName: string } | null;
  onClearDiscard: () => void;
  onConfirmDiscard: () => void;
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
  discardTarget,
  onClearDiscard,
  onConfirmDiscard,
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

      <FileDiscardDialog
        open={discardTarget != null}
        fileName={discardTarget?.fileName ?? ""}
        onOpenChange={(open) => {
          if (!open) onClearDiscard();
        }}
        onDiscard={onConfirmDiscard}
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
