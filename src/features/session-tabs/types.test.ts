import { describe, expect, it } from "vitest";
import {
  fileTabId,
  isFileTab,
  isShellTab,
  shellTabId,
  type SessionTab,
} from "@/features/session-tabs/types";

describe("session tab ids and guards", () => {
  it("builds shell and file tab ids", () => {
    expect(shellTabId("abc")).toBe("shell:abc");
    expect(fileTabId("/tmp/a.ts")).toBe("file:/tmp/a.ts");
  });

  it("discriminates shell and file tabs", () => {
    const shell: SessionTab = { id: "shell:a", kind: "shell", shellId: "a" };
    const file: SessionTab = {
      id: "file:/a",
      kind: "file",
      path: "/a",
      name: "a",
    };

    expect(isShellTab(shell)).toBe(true);
    expect(isShellTab(file)).toBe(false);
    expect(isFileTab(file)).toBe(true);
    expect(isFileTab(shell)).toBe(false);
  });
});
