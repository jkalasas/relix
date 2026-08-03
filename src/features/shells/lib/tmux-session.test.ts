import { describe, expect, it } from "vitest";
import {
  DEFAULT_TMUX_SESSION,
  resolveTmuxBase,
  tmuxSessionForWorkspace,
} from "@/features/shells/lib/tmux-session";

describe("tmux session naming", () => {
  it("resolves base session names", () => {
    expect(resolveTmuxBase(undefined)).toBe(DEFAULT_TMUX_SESSION);
    expect(resolveTmuxBase(null)).toBe(DEFAULT_TMUX_SESSION);
    expect(resolveTmuxBase("  ")).toBe(DEFAULT_TMUX_SESSION);
    expect(resolveTmuxBase(" app ")).toBe("app");
  });

  it("uses base for adhoc and suffixes project workspaces", () => {
    expect(tmuxSessionForWorkspace("relix", "h1::adhoc")).toBe("relix");
    expect(tmuxSessionForWorkspace("relix", "not-a-workspace")).toBe("relix");
    expect(tmuxSessionForWorkspace("relix", "h1::project::p1")).toBe(
      "relix_p_p1",
    );
    expect(tmuxSessionForWorkspace("  app  ", "h1::project::feat")).toBe(
      "app_p_feat",
    );
  });
});
