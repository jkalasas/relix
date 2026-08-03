import { describe, expect, it } from "vitest";
import type { HostConfig } from "@/features/hosts";
import {
  hostToConnectPayload,
  tmuxAttachCommand,
} from "@/features/ssh/commands";

const host: HostConfig = {
  id: "h1",
  name: "Prod",
  user: "deploy",
  hostname: "example.com",
  port: 22,
  authMethod: "private_key",
  privateKey: "KEY",
  privateKeyPath: "/tmp/key",
  passphrase: "phrase",
  shellMode: "tmux",
  tmuxSession: "relix",
};

describe("hostToConnectPayload", () => {
  it("maps connect fields and omits shell options", () => {
    expect(hostToConnectPayload(host)).toEqual({
      hostId: "h1",
      user: "deploy",
      hostname: "example.com",
      port: 22,
      authMethod: "private_key",
      password: undefined,
      privateKey: "KEY",
      privateKeyPath: "/tmp/key",
      passphrase: "phrase",
    });
  });
});

describe("tmuxAttachCommand", () => {
  it("builds an attach script for a window", () => {
    const cmd = tmuxAttachCommand("relix", "@3");
    expect(cmd.startsWith("bash -lc ")).toBe(true);
    expect(cmd).toContain("tmux has-session");
    expect(cmd).toContain("relix_w3");
    expect(cmd).toContain("select-window");
    expect(cmd).toContain("attach-session");
  });

  it("shell-quotes session names with apostrophes", () => {
    const cmd = tmuxAttachCommand("re'lix", "1");
    expect(cmd).toContain(`'"'"'`);
  });
});
