import type { ReactNode } from "react";
import { SessionTabBar } from "@/components/workspace/session-tab-bar";
import {
  AppSidebar,
  SessionHeader,
  type Host,
} from "@/features/hosts";
import {
  FileTreeSidebar,
  FileWorkspace,
  FilesWorkspace,
  type FilesController,
} from "@/features/files";
import {
  ForwardForm,
  ForwardsPanel,
  type PortForward,
  type PortForwardConfig,
} from "@/features/forwards";
import {
  GitPanel,
  type GitController,
  type GitWorktreesController,
} from "@/features/git";
import {
  WorkspaceRecents,
  WorktreeSwitcher,
  parseWorkspaceId,
  pathsMatch,
  projectActiveRoot,
  type ProjectConfig,
  type WorkspaceId,
  type WorkspaceRef,
} from "@/features/projects";
import type { OpenFileState, SessionTab } from "@/features/session-tabs";
import {
  TerminalHost,
  type LiveTerminal,
  type ShellLaunchId,
  type ShellSession,
} from "@/features/shells";
import type { FsEntry } from "@/features/ssh";

type SidebarWidth = {
  widthPx: number;
  setWidthPx: (px: number) => void;
  beginResize: () => void;
  endResize: (finalPx: number) => void;
};

type WorkspaceChromeProps = {
  selectedHost: Host | null;
  useTitlebarSessionChrome: boolean;
  activeProject: ProjectConfig | null;
  activeScopeLabel: string;
  canSaveAdhocProject: boolean;
  activeShellCwd: string | null;
  filesPath: string | null;
  connecting: boolean;
  inWorkspace: boolean;
  activeWorkspaceId: WorkspaceId | null;
  selectedTabs: SessionTab[];
  activeTabId: string | null;
  selectedSessions: ShellSession[];
  selectedFiles: Record<string, OpenFileState>;
  selectedIsLocal: boolean;
  recents: WorkspaceRef[];
  hosts: Host[];
  projectsByHost: Record<string, ProjectConfig[]>;
  gitWorktrees: GitWorktreesController | null;
  onConnect: (hostId: string) => void;
  onDisconnect: (host: Host) => void;
  onEditHost: (hostId: string) => void;
  onBack: () => void;
  onSaveProject?: () => void;
  onSetProjectWorktree?: (worktreePath: string | null) => void;
  onOpenRecent: (ref: WorkspaceRef) => void;
  onReorderRecents: (orderedIds: string[]) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameShell: (shellId: string, name: string) => void;
  onReorderTabs: (orderedIds: string[]) => void;
  onNewShell: (launchId?: ShellLaunchId) => void;
  onOpenFiles: () => void;
  onOpenPorts: () => void;
  onOpenGit: () => void;
};

export function createWorkspaceSessionChrome({
  selectedHost,
  useTitlebarSessionChrome,
  activeProject,
  activeScopeLabel,
  canSaveAdhocProject,
  activeShellCwd,
  filesPath,
  connecting,
  inWorkspace,
  activeWorkspaceId,
  selectedTabs,
  activeTabId,
  selectedSessions,
  selectedFiles,
  selectedIsLocal,
  recents,
  hosts,
  projectsByHost,
  gitWorktrees,
  onConnect,
  onDisconnect,
  onEditHost,
  onBack,
  onSaveProject,
  onSetProjectWorktree,
  onOpenRecent,
  onReorderRecents,
  onSelectTab,
  onCloseTab,
  onRenameShell,
  onReorderTabs,
  onNewShell,
  onOpenFiles,
  onOpenPorts,
  onOpenGit,
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
        variant={useTitlebarSessionChrome ? "titlebar" : "default"}
      />
    ) : null;

  const sessionControls = (
    <div className="flex shrink-0 items-center gap-0.5">
      <WorkspaceRecents
        recents={recents}
        hosts={hosts}
        projectsByHost={projectsByHost}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={onOpenRecent}
        onReorder={onReorderRecents}
      />
      {activeProject && gitWorktrees && onSetProjectWorktree ? (
        <WorktreeSwitcher
          project={activeProject}
          worktrees={gitWorktrees}
          connected={
            selectedHost != null &&
            (selectedIsLocal || selectedHost.status === "connected")
          }
          onSelect={onSetProjectWorktree}
        />
      ) : null}
    </div>
  );

  const activeRoot = activeProject ? projectActiveRoot(activeProject) : null;
  const currentWorktree =
    activeRoot && gitWorktrees
      ? (gitWorktrees.worktrees.find((entry) =>
          pathsMatch(entry.path, activeRoot),
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
        leadingExtra={useTitlebarSessionChrome ? sessionControls : undefined}
        trailingExtra={useTitlebarSessionChrome ? undefined : sessionControls}
        variant={useTitlebarSessionChrome ? "titlebar" : "default"}
      />
    ) : null;

  return { sessionHeader, sessionTabBar };
}

type WorkspaceFileRailProps = {
  selectedHost: Host;
  showFileRail: boolean;
  sidebarWidth: SidebarWidth;
  activeProject: ProjectConfig | null;
  files: FilesController;
  selectedPath: string | null;
  onShowHosts: () => void;
  onOpenFile: (entry: FsEntry) => void;
};

export function WorkspaceFileRail({
  selectedHost,
  showFileRail,
  sidebarWidth,
  activeProject,
  files,
  selectedPath,
  onShowHosts,
  onOpenFile,
}: WorkspaceFileRailProps) {
  if (!showFileRail) return null;
  return (
    <AppSidebar
      widthPx={sidebarWidth.widthPx}
      onWidthChange={sidebarWidth.setWidthPx}
      onResizeStart={sidebarWidth.beginResize}
      onResizeEnd={sidebarWidth.endResize}
      rootLabel={activeProject?.name ?? selectedHost.name}
      onShowHosts={onShowHosts}
    >
      <FileTreeSidebar
        files={files}
        rootLabel={activeProject?.name ?? selectedHost.name}
        selectedPath={selectedPath}
        onOpenFile={onOpenFile}
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
  portsChromeOpen: boolean;
  gitChromeOpen: boolean;
  explorerChromeOpen: boolean;
  selectedForwards: PortForward[];
  files: FilesController;
  git: GitController;
  activeTab: SessionTab | null;
  openFileTabs: Extract<SessionTab, { kind: "file" }>[];
  selectedFiles: Record<string, OpenFileState>;
  onConnect: (hostId: string) => void;
  onAddForward: () => void;
  onEditForward: (id: string) => void;
  onStartForward: (hostId: string, forward: PortForward) => void;
  onStopForward: (hostId: string, id: string) => void;
  onDeleteForward: (id: string) => void;
  onSaveForward: (config: PortForwardConfig) => void;
  onCloseForwardForm: () => void;
  onOpenFile: (entry: FsEntry) => void;
  onChangeFileText: (path: string, text: string) => void;
  onSaveFile: (path: string) => void | Promise<void>;
  onDownloadFile: (path: string) => void;
  onOpenFiles: () => void;
};

export function WorkspaceMain({
  selectedHost,
  pageIsWorkspace,
  forwardFormMode,
  editingForward,
  useTitlebarSessionChrome,
  sessionHeader,
  sessionTabBar,
  portsChromeOpen,
  gitChromeOpen,
  explorerChromeOpen,
  selectedForwards,
  files,
  git,
  activeTab,
  openFileTabs,
  selectedFiles,
  onConnect,
  onAddForward,
  onEditForward,
  onStartForward,
  onStopForward,
  onDeleteForward,
  onSaveForward,
  onCloseForwardForm,
  onOpenFile,
  onChangeFileText,
  onSaveFile,
  onDownloadFile,
  onOpenFiles,
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

      {portsChromeOpen ? (
        <ForwardsPanel
          host={selectedHost}
          forwards={selectedForwards}
          onConnect={() => onConnect(selectedHost.id)}
          onAddForward={onAddForward}
          onStartForward={(id) => {
            const forward = selectedForwards.find((item) => item.id === id);
            if (forward) onStartForward(selectedHost.id, forward);
          }}
          onStopForward={(id) => onStopForward(selectedHost.id, id)}
          onEditForward={onEditForward}
          onDeleteForward={(id) => void onDeleteForward(id)}
        />
      ) : null}

      {gitChromeOpen ? (
        <GitPanel
          host={selectedHost}
          git={git}
          onConnect={() => onConnect(selectedHost.id)}
        />
      ) : null}

      <div
        className={
          explorerChromeOpen ? "flex min-h-0 flex-1 flex-col" : "hidden"
        }
        aria-hidden={!explorerChromeOpen}
      >
        <FilesWorkspace
          host={selectedHost}
          files={files}
          activeKind={activeTab?.kind === "file" ? "file" : "files"}
          onConnect={() => onConnect(selectedHost.id)}
          onOpenFile={onOpenFile}
          fileSlot={openFileTabs.map((tab) => {
            const state = selectedFiles[tab.path];
            if (!state) return null;
            const active =
              activeTab?.kind === "file" && activeTab.path === tab.path;
            return (
              <div
                key={tab.id}
                className={
                  active ? "flex min-h-0 flex-1 flex-col" : "hidden"
                }
                aria-hidden={!active}
              >
                <FileWorkspace
                  state={state}
                  onChangeText={(text) => onChangeFileText(tab.path, text)}
                  onSave={async () => {
                    await onSaveFile(tab.path);
                  }}
                  onDownload={() => void onDownloadFile(tab.path)}
                  onRevealFiles={onOpenFiles}
                />
              </div>
            );
          })}
        />
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
  getProjectPath: (hostId: string, projectId: string) => string | undefined;
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
            ? getProjectPath(hostId, parsed.scope.projectId)
            : (projectRootPath ?? undefined);
        void onOpenShell(workspaceId, hostId, launchId, root);
      }}
      onSessionCwd={onSessionCwd}
    />
  );
}
