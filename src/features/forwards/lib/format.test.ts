import { describe, expect, it } from "vitest";
import type { PortForward, PortForwardConfig } from "@/features/forwards/types";
import {
  configToForward,
  configsToForwards,
  formatForwardEndpoint,
  formatForwardSource,
  formatForwardTarget,
  idleForwards,
  toPortForwardConfig,
} from "@/features/forwards/lib/format";

const local: PortForwardConfig = {
  id: "f1",
  type: "L",
  localHost: "127.0.0.1",
  localPort: 8080,
  remoteHost: "db",
  remotePort: 5432,
  autoStart: true,
};

const remote: PortForwardConfig = {
  ...local,
  id: "f2",
  type: "R",
};

const dynamic: PortForwardConfig = {
  ...local,
  id: "f3",
  type: "D",
  remoteHost: "",
  remotePort: 0,
};

describe("formatForward*", () => {
  it("formats endpoints", () => {
    expect(formatForwardEndpoint("127.0.0.1", 8080)).toBe("127.0.0.1:8080");
  });

  it("formats source and target by type", () => {
    expect(formatForwardSource(local)).toBe("127.0.0.1:8080");
    expect(formatForwardTarget(local)).toBe("db:5432");

    expect(formatForwardSource(remote)).toBe("db:5432");
    expect(formatForwardTarget(remote)).toBe("127.0.0.1:8080");

    expect(formatForwardSource(dynamic)).toBe("127.0.0.1:8080");
    expect(formatForwardTarget(dynamic)).toBeNull();
  });
});

describe("config conversions", () => {
  it("round-trips config and adds idle status", () => {
    expect(toPortForwardConfig(local)).toEqual(local);
    expect(configToForward(local)).toEqual({ ...local, status: "idle" });
    expect(configsToForwards([local, remote])).toEqual([
      { ...local, status: "idle" },
      { ...remote, status: "idle" },
    ]);
  });

  it("idleForwards clears status and error", () => {
    const active: PortForward[] = [
      { ...local, status: "error", errorMessage: "bind failed" },
    ];
    expect(idleForwards(active)).toEqual([
      { ...local, status: "idle", errorMessage: undefined },
    ]);
  });
});
