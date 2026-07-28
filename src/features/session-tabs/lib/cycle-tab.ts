import type { SessionTab } from "@/features/session-tabs/types";

export function cycleTabId(
  tabs: SessionTab[],
  activeId: string | null,
  delta: 1 | -1,
): string | null {
  if (tabs.length < 2) return null;

  const currentIndex = tabs.findIndex((tab) => tab.id === activeId);
  const from = currentIndex === -1 ? (delta === 1 ? -1 : 0) : currentIndex;
  const nextIndex = (from + delta + tabs.length) % tabs.length;
  return tabs[nextIndex]?.id ?? null;
}
