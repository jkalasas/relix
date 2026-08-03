import { describe, expect, it } from "vitest";
import type { HostConfig } from "@/features/hosts/types";
import { configsToHosts, toHostConfig } from "@/features/hosts/lib/convert";

const config: HostConfig = {
  id: "h1",
  name: "Prod",
  user: "deploy",
  hostname: "example.com",
  port: 22,
  authMethod: "password",
  password: "secret",
  shellMode: "tmux",
  tmuxSession: "relix",
};

describe("toHostConfig", () => {
  it("copies host config fields", () => {
    expect(toHostConfig(config)).toEqual(config);
    expect(toHostConfig(config)).not.toBe(config);
  });
});

describe("configsToHosts", () => {
  it("adds idle status", () => {
    expect(configsToHosts([config])).toEqual([
      { ...config, status: "idle" },
    ]);
  });
});
