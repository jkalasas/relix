import { describe, expect, it } from "vitest";
import {
  FILES_TAB_ID,
  GIT_TAB_ID,
  PORTS_TAB_ID,
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

  it("exports tool tab constants", () => {
    expect(FILES_TAB_ID).toBe("files");
    expect(PORTS_TAB_ID).toBe("ports");
    expect(GIT_TAB_ID).toBe("git");
  });

  it("discriminates shell and file tabs", () => {
    const shell: SessionTab = { id: "shell:a", kind: "shell", shellId: "a" };
    const file: SessionTab = {
      id: "file:/a",
      kind: "file",
      path: "/a",
      name: "a",
    };
    const files: SessionTab = { id: "files", kind: "files" };

    expect(isShellTab(shell)).toBe(true);
    expect(isShellTab(file)).toBe(false);
    expect(isFileTab(file)).toBe(true);
    expect(isFileTab(files)).toBe(false);
  });
});
