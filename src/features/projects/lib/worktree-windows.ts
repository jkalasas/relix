import { isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  WebviewWindow,
  getCurrentWebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { projectWorkspaceId } from "./workspace-id";

const ACTIVE_EVENT = "relix://workspace-active";
const QUERY_EVENT = "relix://workspace-query";

type ActivePayload = {
  label: string;
  workspaceId: string | null;
};

const owners = new Map<string, string>();
let listening = false;
let selfWorkspaceId: string | null = null;

export type WorktreeOwner = {
  label: string;
  workspaceId: string;
};

const ownerListeners = new Set<() => void>();
let ownerSnapshot: readonly WorktreeOwner[] = [];

/** Rebuild the snapshot and wake subscribers. */
function refreshOwners(): void {
  ownerSnapshot = [...owners.entries()].map(([label, workspaceId]) => ({
    label,
    workspaceId,
  }));
  for (const listener of ownerListeners) listener();
}

/** Drop a label from the registry (closed or unreachable window). */
function forgetOwner(label: string): void {
  if (owners.delete(label)) refreshOwners();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Label of this webview window, or null outside Tauri. */
export function currentWindowLabel(): string | null {
  if (!isTauri()) return null;
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return null;
  }
}

/** Start registry listeners (active broadcasts + query re-broadcasts). */
export function ensureWorktreeRegistry(): void {
  if (!isTauri() || listening) return;
  listening = true;
  void listen<ActivePayload>(ACTIVE_EVENT, (event) => {
    const { label, workspaceId } = event.payload;
    if (!label) return;
    if (!workspaceId) {
      forgetOwner(label);
      return;
    }
    owners.set(label, workspaceId);
    refreshOwners();
  });
  void listen(QUERY_EVENT, () => {
    const label = currentWindowLabel();
    if (!label || !selfWorkspaceId) return;
    void emit(ACTIVE_EVENT, { label, workspaceId: selfWorkspaceId });
  });
}

/**
 * Advertise this window's workspace to peers.
 * Call on boot and whenever the active workspace changes.
 */
export function advertiseWorktreeWindow(workspaceId: string | null): void {
  selfWorkspaceId = workspaceId;
  if (!isTauri()) return;
  ensureWorktreeRegistry();
  const label = currentWindowLabel();
  if (!label) return;
  if (!workspaceId) {
    forgetOwner(label);
  } else {
    owners.set(label, workspaceId);
    refreshOwners();
  }
  void emit(ACTIVE_EVENT, { label, workspaceId });
}

/** Subscribe to cross-window ownership changes (useSyncExternalStore). */
export function subscribeWorktreeOwners(listener: () => void): () => void {
  ensureWorktreeRegistry();
  ownerListeners.add(listener);
  return () => {
    ownerListeners.delete(listener);
  };
}

/** Cached snapshot of label-to-workspace ownership across windows. */
export function getWorktreeOwners(): readonly WorktreeOwner[] {
  return ownerSnapshot;
}

/**
 * Label of the window currently showing a workspace, if known.
 * Asks peers to re-advertise first so fresh windows are found.
 */
export async function findWorktreeWindow(
  workspaceId: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  ensureWorktreeRegistry();
  const self = currentWindowLabel();
  for (const [label, owned] of owners) {
    if (owned === workspaceId && label !== self) return label;
  }
  try {
    await emit(QUERY_EVENT);
  } catch {
    return null;
  }
  await sleep(180);
  for (const [label, owned] of owners) {
    if (owned === workspaceId && label !== self) return label;
  }
  return null;
}

/** Focus a window by label; prunes the registry entry on failure. */
export async function focusWorktreeWindow(label: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const target = await WebviewWindow.getByLabel(label);
    if (!target) {
      forgetOwner(label);
      return false;
    }
    try {
      await target.show();
    } catch {
      // already visible
    }
    try {
      await target.unminimize();
    } catch {
      // not minimized
    }
    await target.setFocus();
    return true;
  } catch {
    forgetOwner(label);
    return false;
  }
}

/** Hash payload a secondary window parses on boot. */
export function buildWorktreeHash(input: {
  hostId: string;
  projectId: string;
  worktreePath?: string | null;
}): string {
  const path = input.worktreePath?.trim();
  const base = `#/workspace/${encodeURIComponent(input.hostId)}/${encodeURIComponent(input.projectId)}`;
  return path ? `${base}?worktree=${encodeURIComponent(path)}` : base;
}

/** Parse a `#/workspace/:host/:project?worktree=` hash. */
export function parseWorktreeHash(hash: string): {
  hostId: string;
  projectId: string;
  worktreePath: string | null;
} | null {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = /^\/workspace\/([^/]+)\/([^/?]+)(?:\?(.*))?$/.exec(text);
  if (!match) return null;
  let hostId = "";
  let projectId = "";
  try {
    hostId = decodeURIComponent(match[1]);
    projectId = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!hostId || !projectId) return null;
  let worktreePath: string | null = null;
  const query = match[3];
  if (query) {
    const params = new URLSearchParams(query);
    const raw = params.get("worktree");
    if (raw && raw.trim()) worktreePath = raw;
  }
  return { hostId, projectId, worktreePath };
}

/** Workspace id for a project worktree (home when path is null). */
export function worktreeWorkspaceId(input: {
  hostId: string;
  projectId: string;
  worktreePath?: string | null;
}): string {
  return projectWorkspaceId(input.hostId, input.projectId, input.worktreePath);
}

/** Create a unique secondary-window label (`worktree-*` capability). */
export function newWorktreeLabel(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `worktree-${Date.now().toString(36)}-${rand}`;
}

export type OpenWorktreeResult =
  | "focused"
  | "opened"
  | "unsupported"
  | "failed";

/** Resolve once Tauri confirms the window exists; reject on creation error. */
function waitForWindowCreated(view: WebviewWindow): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    void view.once("tauri://created", () => resolve());
    void view.once("tauri://error", (event) => reject(event.payload));
  });
}

/**
 * Open a worktree in another window, focusing the owner when one exists.
 * Enforces single-view-per-worktree: at most one window per workspace.
 */
export async function openWorktreeWindow(input: {
  hostId: string;
  projectId: string;
  worktreePath?: string | null;
}): Promise<OpenWorktreeResult> {
  if (!isTauri()) return "unsupported";
  const workspaceId = worktreeWorkspaceId(input);
  const owner = await findWorktreeWindow(workspaceId);
  if (owner) {
    const focused = await focusWorktreeWindow(owner);
    if (focused) return "focused";
  }
  try {
    const view = new WebviewWindow(newWorktreeLabel(), {
      url: `/${buildWorktreeHash(input)}`,
      title: "Relix",
      width: 1180,
      height: 740,
      decorations: false,
      center: true,
    });
    await waitForWindowCreated(view);
    try {
      await view.show();
    } catch {
      // already visible
    }
    await view.setFocus();
    return "opened";
  } catch {
    return "failed";
  }
}
