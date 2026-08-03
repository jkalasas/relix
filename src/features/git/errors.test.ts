import { describe, expect, it } from "vitest";
import { parseGitError } from "@/features/git/errors";

describe("parseGitError", () => {
  it("accepts a direct command error object", () => {
    expect(
      parseGitError({ code: "no_upstream", message: "no tracking branch" }),
    ).toEqual({
      code: "no_upstream",
      message: "no tracking branch",
    });
  });

  it("parses JSON strings and plain strings", () => {
    expect(
      parseGitError(
        JSON.stringify({ code: "empty_commit_message", message: "empty" }),
      ),
    ).toEqual({
      code: "empty_commit_message",
      message: "empty",
    });
    expect(parseGitError("boom")).toEqual({
      code: "internal",
      message: "boom",
    });
  });

  it("unwraps nested containers", () => {
    expect(
      parseGitError({
        message: JSON.stringify({
          code: "auth_required",
          message: "login",
        }),
      }),
    ).toEqual({ code: "auth_required", message: "login" });

    expect(
      parseGitError({
        payload: { code: "timed_out", message: "slow" },
      }),
    ).toEqual({ code: "timed_out", message: "slow" });
  });

  it("falls back to unknown internal", () => {
    expect(parseGitError(undefined)).toEqual({
      code: "internal",
      message: "Unknown git error",
    });
  });
});
