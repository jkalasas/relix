import type { GitCommandError, GitErrorCode } from "@/features/git/types";

const KNOWN_GIT_ERROR_CODES: ReadonlySet<string> = new Set([
  "not_installed",
  "too_old",
  "not_connected",
  "unavailable",
  "not_a_directory",
  "invalid_path",
  "file_too_large",
  "no_upstream",
  "auth_required",
  "timed_out",
  "empty_commit_message",
  "command_failed",
  "spawn_failed",
  "internal",
]);

function isGitErrorCode(code: unknown): code is GitErrorCode {
  return typeof code === "string" && KNOWN_GIT_ERROR_CODES.has(code);
}

function asGitCommandError(value: unknown): GitCommandError | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (!isGitErrorCode(obj.code)) return null;

  const message =
    typeof obj.message === "string" && obj.message.length > 0
      ? obj.message
      : obj.code;

  return {
    code: obj.code,
    message,
  };
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function parseGitError(error: unknown): GitCommandError {
  const direct = asGitCommandError(error);
  if (direct) return direct;

  if (typeof error === "string") {
    const parsed = tryParseJson(error);
    const fromJson = asGitCommandError(parsed);
    if (fromJson) return fromJson;
    return { code: "internal", message: error };
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") {
      const nestedParsed = tryParseJson(obj.message);
      const fromNested = asGitCommandError(nestedParsed);
      if (fromNested) return fromNested;

      const fromMessageObject = asGitCommandError(obj.message);
      if (fromMessageObject) return fromMessageObject;

      return { code: "internal", message: obj.message };
    }

    for (const key of ["error", "data", "payload"] as const) {
      const nested = asGitCommandError(obj[key]);
      if (nested) return nested;
      if (typeof obj[key] === "string") {
        const fromKey = asGitCommandError(tryParseJson(obj[key] as string));
        if (fromKey) return fromKey;
      }
    }
  }

  return { code: "internal", message: "Unknown git error" };
}
