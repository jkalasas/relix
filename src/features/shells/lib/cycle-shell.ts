import type { ShellSession } from "@/features/shells/types";

export function cycleShellId(
  sessions: ShellSession[],
  activeId: string | null,
  delta: 1 | -1,
): string | null {
  if (sessions.length < 2) return null;

  const currentIndex = sessions.findIndex((session) => session.id === activeId);
  const from = currentIndex === -1 ? (delta === 1 ? -1 : 0) : currentIndex;
  const nextIndex = (from + delta + sessions.length) % sessions.length;
  return sessions[nextIndex]?.id ?? null;
}
