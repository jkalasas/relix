import { describe, expect, it } from "vitest";
import type { PortForwardConfig } from "@/features/forwards/types";
import {
  descriptionForForwardType,
  normalizeForwardConfig,
  validateForwardConfig,
} from "@/features/forwards/lib/validate";

function forward(overrides: Partial<PortForwardConfig> = {}): PortForwardConfig {
  return {
    id: "f1",
    type: "L",
    localHost: "127.0.0.1",
    localPort: 8080,
    remoteHost: "db.internal",
    remotePort: 5432,
    autoStart: false,
    ...overrides,
  };
}

describe("validateForwardConfig", () => {
  it("accepts a valid local forward", () => {
    expect(validateForwardConfig(forward())).toBeNull();
  });

  it("requires local host with type-specific messages", () => {
    expect(validateForwardConfig(forward({ localHost: " " }))).toBe(
      "Local bind host is required",
    );
    expect(validateForwardConfig(forward({ type: "R", localHost: "" }))).toBe(
      "Local target host is required",
    );
  });

  it("validates local port range", () => {
    expect(validateForwardConfig(forward({ localPort: 0 }))).toBe(
      "Local port must be between 1 and 65535",
    );
    expect(validateForwardConfig(forward({ type: "R", localPort: 70000 }))).toBe(
      "Local target port must be between 1 and 65535",
    );
  });

  it("skips remote checks for dynamic forwards", () => {
    expect(
      validateForwardConfig(
        forward({
          type: "D",
          remoteHost: "",
          remotePort: 0,
        }),
      ),
    ).toBeNull();
  });

  it("requires remote host and port for L/R", () => {
    expect(validateForwardConfig(forward({ remoteHost: " " }))).toBe(
      "Remote host is required",
    );
    expect(validateForwardConfig(forward({ type: "R", remoteHost: "" }))).toBe(
      "Remote listen host is required",
    );
    expect(validateForwardConfig(forward({ remotePort: 0 }))).toBe(
      "Remote port must be between 1 and 65535",
    );
    expect(
      validateForwardConfig(forward({ type: "R", remotePort: 65536 })),
    ).toBe("Remote listen port must be between 1 and 65535");
  });
});

describe("normalizeForwardConfig", () => {
  it("trims hosts and clears remote for dynamic", () => {
    expect(
      normalizeForwardConfig(
        forward({
          type: "D",
          localHost: " 0.0.0.0 ",
          remoteHost: "ignored",
          remotePort: 9,
        }),
      ),
    ).toEqual({
      id: "f1",
      type: "D",
      localHost: "0.0.0.0",
      localPort: 8080,
      remoteHost: "",
      remotePort: 0,
      autoStart: false,
    });
  });
});

describe("descriptionForForwardType", () => {
  it("returns type descriptions", () => {
    expect(descriptionForForwardType("L")).toContain("Local forward (L)");
    expect(descriptionForForwardType("R")).toContain("Remote forward (R)");
    expect(descriptionForForwardType("D")).toContain("Dynamic SOCKS (D)");
  });
});
