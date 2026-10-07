import { describe, expect, it } from "vitest";
import {
  buildNotificationItems,
  describeTab,
} from "@/features/notify/lib/notification-items";
import type { SessionTab } from "@/features/session-tabs";
import type { NotificationEntry } from "@/features/notify/types";

const entry: NotificationEntry = {
  id: "m1",
  tabId: "shell:a",
  title: "build done",
  body: "ok",
  hostId: "h1",
  workspaceId: "h1::adhoc",
  receivedAt: 1,
};

const ctx = {
  tabsByWorkspace: {
    "h1::adhoc": [
      { id: "shell:a", kind: "shell", shellId: "a" },
    ] as SessionTab[],
  },
  hosts: [
    {
      id: "h1",
      name: "bastion",
      hostname: "example.com",
      user: "ops",
      port: 22,
      status: "connected",
    },
  ],
  projectsByHost: {},
  sessionsByWorkspace: {
    "h1::adhoc": [
      { id: "a", hostId: "h1", workspaceId: "h1::adhoc", title: "api" },
    ],
  },
} as unknown as Parameters<typeof buildNotificationItems>[1];

describe("describeTab", () => {
  it("uses the live shell title", () => {
    expect(describeTab("shell:a", "h1::adhoc", ctx)).toBe("api");
  });

  it("falls back to the raw tab id", () => {
    expect(describeTab("shell:missing", "h1::adhoc", ctx)).toBe(
      "shell:missing",
    );
    expect(describeTab("shell:a", null, ctx)).toBe("shell:a");
  });
});

describe("buildNotificationItems", () => {
  it("enriches entries with host and scope names", () => {
    const [item] = buildNotificationItems([entry], ctx);
    expect(item.hostName).toBe("bastion");
    expect(item.scopeName).toBe("Ad hoc");
    expect(item.tabLabel).toBe("api");
  });

  it("sorts newest first", () => {
    const older = { ...entry, tabId: "shell:old", receivedAt: 1 };
    const newer = { ...entry, tabId: "shell:new", receivedAt: 2 };
    const [first, second] = buildNotificationItems([older, newer], ctx);
    expect(first.tabId).toBe("shell:new");
    expect(second.tabId).toBe("shell:old");
  });

  it("labels project scopes with the project name", () => {
    const projectCtx = {
      ...ctx,
      projectsByHost: {
        h1: [{ id: "p1", name: "api", path: "/srv/api" }],
      },
    } as unknown as Parameters<typeof buildNotificationItems>[1];
    const [item] = buildNotificationItems(
      [{ ...entry, workspaceId: "h1::project::p1" }],
      projectCtx,
    );
    expect(item.scopeName).toBe("api");
  });
});
