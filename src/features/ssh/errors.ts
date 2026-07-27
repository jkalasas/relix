import type { SshCommandError, SshErrorCode } from "@/features/ssh/types";

const KNOWN_SSH_ERROR_CODES: ReadonlySet<string> = new Set([
  "host_key_unknown",
  "host_key_changed",
  "auth_failed",
  "connect_failed",
  "key_unreadable",
  "invalid_key",
  "not_connected",
  "bind_failed",
  "forward_failed",
  "not_found",
  "internal",
]);

function isSshErrorCode(code: unknown): code is SshErrorCode {
  return typeof code === "string" && KNOWN_SSH_ERROR_CODES.has(code);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalPort(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asSshCommandError(value: unknown): SshCommandError | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (!isSshErrorCode(obj.code)) return null;

  const message =
    typeof obj.message === "string" && obj.message.length > 0
      ? obj.message
      : obj.code;

  return {
    code: obj.code,
    message,
    hostname: optionalString(obj.hostname),
    port: optionalPort(obj.port),
    algorithm: optionalString(obj.algorithm),
    keyBase64: optionalString(obj.keyBase64),
    fingerprint: optionalString(obj.fingerprint),
  };
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function parseSshError(error: unknown): SshCommandError {
  const direct = asSshCommandError(error);
  if (direct) return direct;

  if (typeof error === "string") {
    const parsed = tryParseJson(error);
    const fromJson = asSshCommandError(parsed);
    if (fromJson) return fromJson;
    return { code: "internal", message: error };
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") {
      const nestedParsed = tryParseJson(obj.message);
      const fromNested = asSshCommandError(nestedParsed);
      if (fromNested) return fromNested;

      const fromMessageObject = asSshCommandError(obj.message);
      if (fromMessageObject) return fromMessageObject;

      return { code: "internal", message: obj.message };
    }

    for (const key of ["error", "data", "payload"] as const) {
      const nested = asSshCommandError(obj[key]);
      if (nested) return nested;
      if (typeof obj[key] === "string") {
        const fromKey = asSshCommandError(tryParseJson(obj[key] as string));
        if (fromKey) return fromKey;
      }
    }
  }

  return { code: "internal", message: "Unknown SSH error" };
}
