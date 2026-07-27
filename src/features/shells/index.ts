export type * from "@/features/shells/types";
export {
  SHELL_LAUNCHES,
  nextSessionTitle,
  shellLaunchById,
  type ShellLaunch,
  type ShellLaunchId,
} from "@/features/shells/launch";
export {
  useActiveShellFallback,
  useShells,
} from "@/features/shells/use-shells";
export { TerminalPanel } from "@/features/shells/components/terminal-panel";
