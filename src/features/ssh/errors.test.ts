import { describe, expect, it } from "vitest";
import { parseSshError } from "@/features/ssh/errors";

describe("parseSshError", () => {
  it("accepts a direct command error object", () => {
    expect(
      parseSshError({
        code: "auth_failed",
        message: "bad password",
        hostname: "example.com",
        port: 22,
      }),
    ).toEqual({
      code: "auth_failed",
      message: "bad password",
      hostname: "example.com",
      port: 22,
      algorithm: undefined,
      keyBase64: undefined,
      fingerprint: undefined,
    });
  });

  it("parses JSON strings and plain strings", () => {
    expect(
      parseSshError(
        JSON.stringify({ code: "not_connected", message: "gone" }),
      ),
    ).toEqual({
      code: "not_connected",
      message: "gone",
      hostname: undefined,
      port: undefined,
      algorithm: undefined,
      keyBase64: undefined,
      fingerprint: undefined,
    });
    expect(parseSshError("raw failure")).toEqual({
      code: "internal",
      message: "raw failure",
    });
  });

  it("unwraps nested message / error / data / payload", () => {
    expect(
      parseSshError({
        message: JSON.stringify({
          code: "bind_failed",
          message: "port in use",
        }),
      }),
    ).toMatchObject({ code: "bind_failed", message: "port in use" });

    expect(
      parseSshError({
        error: { code: "forward_failed", message: "tunnel down" },
      }),
    ).toMatchObject({ code: "forward_failed", message: "tunnel down" });

    expect(
      parseSshError({
        data: JSON.stringify({ code: "not_found", message: "missing" }),
      }),
    ).toMatchObject({ code: "not_found", message: "missing" });
  });

  it("falls back to unknown internal", () => {
    expect(parseSshError(null)).toEqual({
      code: "internal",
      message: "Unknown SSH error",
    });
    expect(parseSshError({ code: "nope", message: "x" })).toEqual({
      code: "internal",
      message: "x",
    });
  });
});
