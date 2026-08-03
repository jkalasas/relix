import { describe, expect, it } from "vitest";
import type { HostConfig } from "@/features/hosts/types";
import { normalizeHostConfig, validateHostConfig } from "@/features/hosts/lib/validate";

function host(overrides: Partial<HostConfig> = {}): HostConfig {
  return {
    id: "h1",
    name: "Prod",
    user: "deploy",
    hostname: "example.com",
    port: 22,
    authMethod: "password",
    password: "secret",
    ...overrides,
  };
}

describe("validateHostConfig", () => {
  it("accepts a valid password host", () => {
    expect(validateHostConfig(host())).toBeNull();
  });

  it("requires name, user, and hostname", () => {
    expect(validateHostConfig(host({ name: "  " }))).toBe("Name is required");
    expect(validateHostConfig(host({ user: "" }))).toBe("User is required");
    expect(validateHostConfig(host({ hostname: "\t" }))).toBe(
      "Hostname is required",
    );
  });

  it("requires port in 1..65535", () => {
    expect(validateHostConfig(host({ port: 0 }))).toBe(
      "Port must be between 1 and 65535",
    );
    expect(validateHostConfig(host({ port: 65536 }))).toBe(
      "Port must be between 1 and 65535",
    );
    expect(validateHostConfig(host({ port: 22.5 }))).toBe(
      "Port must be between 1 and 65535",
    );
  });

  it("requires password for password auth", () => {
    expect(
      validateHostConfig(host({ authMethod: "password", password: " " })),
    ).toBe("Password is required");
  });

  it("requires private key or path for private_key auth", () => {
    expect(
      validateHostConfig(
        host({
          authMethod: "private_key",
          password: undefined,
          privateKey: undefined,
          privateKeyPath: undefined,
        }),
      ),
    ).toBe("Private key or key path is required");

    expect(
      validateHostConfig(
        host({
          authMethod: "private_key",
          password: undefined,
          privateKey: "-----BEGIN KEY-----",
        }),
      ),
    ).toBeNull();

    expect(
      validateHostConfig(
        host({
          authMethod: "private_key",
          password: undefined,
          privateKeyPath: "~/.ssh/id_ed25519",
        }),
      ),
    ).toBeNull();
  });
});

describe("normalizeHostConfig", () => {
  it("trims string fields", () => {
    const result = normalizeHostConfig(
      host({
        name: "  Prod  ",
        user: " deploy ",
        hostname: " example.com ",
        password: " secret ",
      }),
    );
    expect(result.name).toBe("Prod");
    expect(result.user).toBe("deploy");
    expect(result.hostname).toBe("example.com");
    expect(result.password).toBe("secret");
  });

  it("clears password when auth is private_key", () => {
    const result = normalizeHostConfig(
      host({
        authMethod: "private_key",
        password: "secret",
        privateKey: " key ",
        privateKeyPath: " /tmp/key ",
        passphrase: " phrase ",
      }),
    );
    expect(result.password).toBeUndefined();
    expect(result.privateKey).toBe("key");
    expect(result.privateKeyPath).toBe("/tmp/key");
    expect(result.passphrase).toBe("phrase");
  });

  it("clears private key fields when auth is password", () => {
    const result = normalizeHostConfig(
      host({
        authMethod: "password",
        privateKey: "key",
        privateKeyPath: "/tmp/key",
        passphrase: "phrase",
      }),
    );
    expect(result.privateKey).toBeUndefined();
    expect(result.privateKeyPath).toBeUndefined();
    expect(result.passphrase).toBeUndefined();
  });

  it("normalizes shellMode and tmuxSession", () => {
    expect(normalizeHostConfig(host({ shellMode: "plain" })).shellMode).toBe(
      "plain",
    );
    expect(
      normalizeHostConfig(host({ shellMode: "tmux", tmuxSession: "  app  " }))
        .tmuxSession,
    ).toBe("app");
    expect(
      normalizeHostConfig(host({ shellMode: "plain", tmuxSession: "app" }))
        .tmuxSession,
    ).toBeUndefined();
    expect(normalizeHostConfig(host({})).shellMode).toBe("plain");
  });
});
