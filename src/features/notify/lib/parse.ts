import type { NotifyPayload } from "@/features/notify/types";

export function parseNotifyPayload(value: unknown): NotifyPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = record.id;
  const tabId = record.tabId;
  if (typeof id !== "string" || id.trim() === "") return null;
  if (typeof tabId !== "string" || tabId.trim() === "") return null;
  if (id.length > 256 || tabId.length > 256) return null;
  const title = record.title;
  const body = record.body;
  return {
    id,
    tabId,
    ...(typeof title === "string" && title !== "" ? { title } : {}),
    ...(typeof body === "string" && body !== "" ? { body } : {}),
  };
}

export function parseSseDataLine(line: string): NotifyPayload | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const json = trimmed.slice("data:".length).trim();
  if (json === "") return null;
  try {
    return parseNotifyPayload(JSON.parse(json));
  } catch {
    return null;
  }
}
