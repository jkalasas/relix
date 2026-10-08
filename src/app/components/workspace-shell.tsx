import type { ReactNode } from "react";
import { SessionTabBar } from "@/components/workspace/session-tab-bar";
import {
  NotificationBell,
  type NotificationBellProps,
} from "@/features/notify";
import {
  AppSidebar,
  SessionHeader,
  type Host,
} from "@/features/hosts";
import { FileWorkspace } from "@/features/files";
import {
  ForwardForm,
  type PortForward,
  type PortForwardConfig,
} from "@/features/forwards";
import type { GitWorktreesController } from "@/features/git";
import {
  ProjectWorktreeTree,
  parseWorkspaceId,
  pathsMatch,
  type ProjectConfig,
  type WorkspaceId,
} from "@/features/projects";
import type { OpenFileState, SessionTab } from "@/features/session-tabs";
import {
  TerminalHost,
  type LiveTerminal,
  type ShellLaunchId,
  type ShellSession,
} from "@/features/shells";

type SidebarWidth = {
  widthPx: number;
  setWidthPx: (px: number) => void;
  beginResize: () => void;
  endResize: (finalPx: number) => void;
};

type WorkspaceChromeProps = {
  selectedHost: Host | null;
  useTitlebarSessionChrome: boolean;
  activeScopeLabel: string;
  canSaveAdhocProject: boolean;
  activeShellCwd: string | null;
  filesPath: string | null;
  connecting: boolean;
  inWorkspace: boolean;
  selectedTabs: SessionTab[];
  activeTabId: string | null;
  selectedSessions: ShellSession[];
  selectedFiles: Record<string, OpenFileState>;
  selectedIsLocal: boolean;
  gitWorktrees: GitWorktreesController | null;
  activeScopeWorktreePath: string | null;
  projectRootPath: string | null;
  onConnect: (hostId: string) => void;
  onDisconnect: (host: Host) => void;
  onEditHost: (hostId: string) => void;
  onBack: () => void;
  onSaveProject?: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameShell: (shellId: string, name: string) => void;
  onReorderTabs: (orderedIds: string[]) => void;
  onNewShell: (launchId?: ShellLaunchId) => void;
  onOpenFiles: () => void;
  onOpenPorts: () => void;
  onOpenGit: () => void;
  notificationCenter?: NotificationBellProps;
  attentionTabIds?: Set<string>;
};

export function createWorkspaceSessionChrome({
  selectedHost,
  useTitlebarSessionChrome,
  activeScopeLabel,
  canSaveAdhocProject,
  activeShellCwd,
  filesPath,
  connecting,
  inWorkspace,
  selectedTabs,
  activeTabId,
  selectedSessions,
  selectedFiles,
  selectedIsLocal,
  gitWorktrees,
  activeScopeWorktreePath,
  projectRootPath,
  onConnect,
  onDisconnect,
  onEditHost,
  onBack,
  onSaveProject,
  onSelectTab,
  onCloseTab,
  onRenameShell,
  onReorderTabs,
  onNewShell,
  onOpenFiles,
  onOpenPorts,
  onOpenGit,
  notificationCenter,
  attentionTabIds,
}: WorkspaceChromeProps): {
  sessionHeader: ReactNode;
  sessionTabBar: ReactNode;
} {
  const sessionTabBar =
    inWorkspace && selectedHost?.status === "connected" ? (
      <SessionTabBar
        tabs={selectedTabs}
        activeId={activeTabId}
        shells={selectedSessions}
        files={selectedFiles}
        showPorts={!selectedIsLocal}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onRenameShell={onRenameShell}
        onReorder={onReorderTabs}
        onNewShell={onNewShell}
        onOpenFiles={onOpenFiles}
        onOpenPorts={onOpenPorts}
        onOpenGit={onOpenGit}
        attentionIds={attentionTabIds}
        variant={useTitlebarSessionChrome ? "titlebar" : "default"}
      />
    ) : null;

  const sessionControls = notificationCenter ? (
    <div className="flex shrink-0 items-center gap-0.5">
      <NotificationBell {...notificationCenter} />
    </div>
  ) : null;

  const activeRoot = projectRootPath ?? null;
  const currentWorktree =
    activeScopeWorktreePath && gitWorktrees
      ? (gitWorktrees.worktrees.find((entry) =>
          pathsMatch(entry.path, activeScopeWorktreePath),
        ) ?? null)
      : null;
  const scopeHint = currentWorktree
    ? currentWorktree.branch ||
      (currentWorktree.head
        ? `detached · ${currentWorktree.head.slice(0, 7)}`
        : null)
    : null;
  const scopePath =
    activeRoot ??
    (canSaveAdhocProject ? (activeShellCwd ?? filesPath) : null);

  const sessionHeader =
    inWorkspace && selectedHost ? (
      <SessionHeader
        host={selectedHost}
        scopeLabel={activeScopeLabel}
        scopePath={scopePath}
        scopeHint={scopeHint}
        connecting={connecting}
        onConnect={() => onConnect(selectedHost.id)}
        onDisconnect={() => onDisconnect(selectedHost)}
        onEdit={() => onEditHost(selectedHost.id)}
        onBack={onBack}
        onSaveProject={onSaveProject}
        trailingExtra={useTitlebarSessionChrome ? undefined : sessionControls}
        variant={useTitlebarSessionChrome ? "titlebar" : "default"}
      />
    ) : null;

  return { sessionHeader, sessionTabBar };
}

type WorkspaceProjectRailProps = {
  selectedHost: Host;
  showRail: boolean;
  sidebarWidth: SidebarWidth;
  projects: ProjectConfig[];
  activeProjectId: string | null;
  activeWorktreePath: string | null;
  adhocActive: boolean;
  connected: boolean;
  openWorkspaceIds: Set<string>;
  onShowHosts: () => void;
  onOpenAdhoc: () => void;
  onSelectWorktree: (projectId: string, worktreePath: string | null) => void;
  onAddProject: () => void;
  onEditProject: (projectId: string) => void;
  onSetWorktree: (projectId: string, worktreePath: string | null) => void;
};

export function WorkspaceProjectRail({
  selectedHost,
  showRail,
  sidebarWidth,
  projects,
  activeProjectId,
  activeWorktreePath,
  adhocActive,
  connected,
  openWorkspaceIds,
  onShowHosts,
  onOpenAdhoc,
  onSelectWorktree,
  onAddProject,
  onEditProject,
  onSetWorktree,
}: WorkspaceProjectRailProps) {
  if (!showRail) return null;
  return (
    <AppSidebar
      widthPx={sidebarWidth.widthPx}
      onWidthChange={sidebarWidth.setWidthPx}
      onResizeStart={sidebarWidth.beginResize}
      onResizeEnd={sidebarWidth.endResize}
      rootLabel={selectedHost.name}
      onShowHosts={onShowHosts}
    >
      <ProjectWorktreeTree
        hostId={selectedHost.id}
        projects={projects}
        activeProjectId={activeProjectId}
        activeWorktreePath={activeWorktreePath}
        adhocActive={adhocActive}
        connected={connected}
        openWorkspaceIds={openWorkspaceIds}
        onOpenAdhoc={onOpenAdhoc}
        onSelectWorktree={onSelectWorktree}
        onAddProject={onAddProject}
        onEditProject={onEditProject}
        onSetWorktree={onSetWorktree}
      />
    </AppSidebar>
  );
}

type WorkspaceMainProps = {
  selectedHost: Host | null;
  pageIsWorkspace: boolean;
  forwardFormMode: { type: "add" } | { type: "edit"; id: string } | null;
  editingForward: PortForward | null;
  useTitlebarSessionChrome: boolean;
  sessionHeader: ReactNode;
  sessionTabBar: ReactNode;
  editorOpen: boolean;
  activeTab: SessionTab | null;
  openFileTabs: Extract<SessionTab, { kind: "file" }>[];
  selectedFiles: Record<string, OpenFileState>;
  onDeleteForward: (id: string) => void;
  onSaveForward: (config: PortForwardConfig) => void;
  onCloseForwardForm: () => void;
  onChangeFileText: (path: string, text: string) => void;
  onSaveFile: (path: string) => void | Promise<void>;
  onDownloadFile: (path: string) => void;
  onRevealFiles: () => void;
};

export function WorkspaceMain({
  selectedHost,
  pageIsWorkspace,
  forwardFormMode,
  editingForward,
  useTitlebarSessionChrome,
  sessionHeader,
  sessionTabBar,
  editorOpen,
  activeTab,
  openFileTabs,
  selectedFiles,
  onDeleteForward,
  onSaveForward,
  onCloseForwardForm,
  onChangeFileText,
  onSaveFile,
  onDownloadFile,
  onRevealFiles,
}: WorkspaceMainProps) {
  if (!pageIsWorkspace) return null;

  if (!selectedHost) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Host unavailable
      </div>
    );
  }

  if (forwardFormMode) {
    return (
      <ForwardForm
        initial={editingForward}
        onSave={onSaveForward}
        onCancel={onCloseForwardForm}
        onDelete={
          forwardFormMode.type === "edit"
            ? (id) => void onDeleteForward(id)
            : undefined
        }
      />
    );
  }

  return (
    <>
      {useTitlebarSessionChrome ? null : sessionHeader}
      {useTitlebarSessionChrome ? null : sessionTabBar}

      <div
        className={editorOpen ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        aria-hidden={!editorOpen}
      >
        {openFileTabs.map((tab) => {
          const state = selectedFiles[tab.path];
          if (!state) return null;
          const active =
            activeTab?.kind === "file" && activeTab.path === tab.path;
          return (
            <div
              key={tab.id}
              className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
              aria-hidden={!active}
            >
              <FileWorkspace
                state={state}
                onChangeText={(text) => onChangeFileText(tab.path, text)}
                onSave={async () => {
                  await onSaveFile(tab.path);
                }}
                onDownload={() => void onDownloadFile(tab.path)}
                onRevealFiles={onRevealFiles}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

type WorkspaceTerminalProps = {
  liveTerminals: LiveTerminal[];
  activeWorkspaceId: WorkspaceId | null;
  shellActiveSessionId: string | null;
  selectedSessions: ShellSession[];
  shellChromeOpen: boolean;
  selectedHost: Host | null;
  projectRootPath: string | null;
  onConnect: (hostId: string) => void;
  onOpenShell: (
    workspaceId: string,
    hostId: string,
    launchId?: ShellLaunchId,
    cwd?: string,
  ) => void | Promise<void>;
  onSessionCwd: (sessionId: string, cwd: string) => void;
  getProjectPath: (
    hostId: string,
    projectId: string,
    worktreePath?: string | null,
  ) => string | undefined;
};

export function WorkspaceTerminal({
  liveTerminals,
  activeWorkspaceId,
  shellActiveSessionId,
  selectedSessions,
  shellChromeOpen,
  selectedHost,
  projectRootPath,
  onConnect,
  onOpenShell,
  onSessionCwd,
  getProjectPath,
}: WorkspaceTerminalProps) {
  return (
    <TerminalHost
      terminals={liveTerminals}
      activeWorkspaceId={activeWorkspaceId}
      activeSessionId={shellActiveSessionId}
      workspaceSessions={selectedSessions}
      surfaceOpen={shellChromeOpen}
      emptyHost={selectedHost}
      emptyWorkspaceId={activeWorkspaceId}
      onConnect={(hostId) => void onConnect(hostId)}
      onOpenShell={(workspaceId, hostId, launchId) => {
        const parsed = parseWorkspaceId(workspaceId);
        const root =
          parsed?.scope.kind === "project"
            ? getProjectPath(
                hostId,
                parsed.scope.projectId,
                parsed.scope.worktreePath ?? undefined,
              )
            : (projectRootPath ?? undefined);
        void onOpenShell(workspaceId, hostId, launchId, root);
      }}
      onSessionCwd={onSessionCwd}
    />
  );
}
