import { describe, expect, it } from "vitest";
import type { Host } from "@/features/hosts/types";
import {
  LOCAL_HOST_ID,
  createLocalHost,
  isLocalHost,
  isLocalHostId,
  withLocalHost,
  withoutLocalHost,
} from "@/features/hosts/lib/local-host";

function remote(id: string): Host {
  return {
    id,
    name: id,
    user: "u",
    hostname: "h",
    port: 22,
    authMethod: "password",
    status: "idle",
  };
}

describe("local host helpers", () => {
  it("identifies the local host id", () => {
    expect(isLocalHostId(LOCAL_HOST_ID)).toBe(true);
    expect(isLocalHostId("other")).toBe(false);
    expect(isLocalHost(createLocalHost())).toBe(true);
    expect(isLocalHost(remote("prod"))).toBe(false);
  });

  it("filters local host out of lists", () => {
    const hosts = [createLocalHost(), remote("a"), remote("b")];
    expect(withoutLocalHost(hosts).map((host) => host.id)).toEqual(["a", "b"]);
  });

  it("prepends local host only when available", () => {
    const remotes = [remote("a")];
    expect(withLocalHost(remotes, false).map((host) => host.id)).toEqual(["a"]);
    expect(withLocalHost(remotes, true).map((host) => host.id)).toEqual([
      "local",
      "a",
    ]);
  });

  it("createLocalHost returns a connected local entry", () => {
    const host = createLocalHost();
    expect(host).toMatchObject({
      id: "local",
      name: "Local",
      hostname: "localhost",
      shellMode: "tmux",
      status: "connected",
    });
  });
});
