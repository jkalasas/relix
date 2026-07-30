export type * from "@/features/shells/types";
export {
  SHELL_LAUNCHES,
  launchBaseTitle,
  nextSessionTitle,
  sessionDisplayTitle,
  shellLaunchById,
  type ShellLaunch,
  type ShellLaunchId,
} from "@/features/shells/launch";
export {
  DEFAULT_TMUX_SESSION,
  useActiveShellFallback,
  useShells,
  type ShellHostOptions,
} from "@/features/shells/use-shells";
export { TerminalPanel } from "@/features/shells/components/terminal-panel";
export {
  TerminalHost,
  type LiveTerminal,
} from "@/features/shells/components/terminal-host";
export { isMobileOs, useIsMobileOs } from "@/features/shells/lib/mobile-os";
