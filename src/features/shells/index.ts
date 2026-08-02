export type * from "@/features/shells/types";
export {
  SHELL_LAUNCHES,
  launchBaseTitle,
  nextSessionTitle,
  sessionDisplayTitle,
  shellLaunchById,
  type ShellLaunch,
  type ShellLaunchId,
} from "@/features/shells/lib/launch";
export {
  DEFAULT_TMUX_SESSION,
  useActiveShellFallback,
  useShells,
  type ShellHostOptions,
} from "@/features/shells/hooks/use-shells";
export { TerminalPanel } from "@/features/shells/components/terminal-panel";
export {
  TerminalHost,
  type LiveTerminal,
} from "@/features/shells/components/terminal-host";
export { ShellCloseDialog } from "@/features/shells/components/shell-close-dialog";
export { isMobileOs, useIsMobileOs } from "@/features/shells/lib/mobile-os";
