import { describe, expect, it } from "vitest";
import {
  DEFAULT_TMUX_SESSION,
  hashWorktreePath,
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

  it("isolates worktree workspaces with a stable hash suffix", () => {
    const main = tmuxSessionForWorkspace(
      "relix",
      "h1::project::p1::worktree::%2Fsrv%2Fapp-main",
    );
    const dev = tmuxSessionForWorkspace(
      "relix",
      "h1::project::p1::worktree::%2Fsrv%2Fapp-dev",
    );
    expect(main).toBe(`relix_p_p1_w_${hashWorktreePath("/srv/app-main")}`);
    expect(dev).not.toBe(main);
    expect(tmuxSessionForWorkspace("relix", "h1::project::p1")).toBe(
      "relix_p_p1",
    );
  });
});
