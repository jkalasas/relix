import { describe, expect, it } from "vitest";
import {
  launchBaseTitle,
  nextSessionTitle,
  sessionDisplayTitle,
  shellLaunchById,
} from "@/features/shells/lib/launch";

describe("shell launch helpers", () => {
  it("resolves launches by id with shell fallback", () => {
    expect(shellLaunchById("claude").id).toBe("claude");
    expect(shellLaunchById("shell").title).toBe("shell");
  });

  it("uses command as base title when present", () => {
    expect(launchBaseTitle(shellLaunchById("claude"))).toBe("claude");
    expect(launchBaseTitle(shellLaunchById("shell"))).toBe("shell");
  });

  it("prefers non-empty custom titles", () => {
    expect(sessionDisplayTitle({ title: "shell", customTitle: "  api  " })).toBe(
      "api",
    );
    expect(sessionDisplayTitle({ title: "shell", customTitle: "   " })).toBe(
      "shell",
    );
    expect(sessionDisplayTitle({ title: "shell" })).toBe("shell");
  });

  it("increments duplicate session titles", () => {
    expect(nextSessionTitle([], "shell")).toBe("shell");
    expect(
      nextSessionTitle([{ title: "shell" }, { title: "shell 2" }], "shell"),
    ).toBe("shell 3");
    expect(
      nextSessionTitle(
        [{ title: "shell", customTitle: "work" }],
        "work",
      ),
    ).toBe("work 2");
  });
});
