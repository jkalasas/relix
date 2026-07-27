export type ShellLaunchId = "shell" | "claude" | "opencode" | "pi";

export type ShellLaunch = {
  id: ShellLaunchId;
  label: string;
  title: string;
  command?: string;
};

export const SHELL_LAUNCHES: readonly ShellLaunch[] = [
  { id: "shell", label: "Shell", title: "shell" },
  { id: "claude", label: "Claude Code", title: "claude", command: "claude" },
  { id: "opencode", label: "Opencode", title: "opencode", command: "opencode" },
  { id: "pi", label: "Pi", title: "pi", command: "pi" },
] as const;

export function shellLaunchById(id: ShellLaunchId): ShellLaunch {
  return SHELL_LAUNCHES.find((launch) => launch.id === id) ?? SHELL_LAUNCHES[0];
}

export function launchBaseTitle(launch: ShellLaunch): string {
  return launch.command ?? launch.title;
}

export function sessionDisplayTitle(session: {
  title: string;
  customTitle?: string;
}): string {
  const custom = session.customTitle?.trim();
  return custom && custom.length > 0 ? custom : session.title;
}

export function nextSessionTitle(
  existing: { title: string; customTitle?: string }[],
  base: string,
): string {
  const used = new Set(existing.map((session) => sessionDisplayTitle(session)));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
