import type { CSSProperties } from "react";
import { PanelRight } from "lucide-react";
import type { AppController } from "@/app/hooks/use-app-controller";
import { NotificationBell } from "@/features/notify";
import { AppDialogs } from "@/app/components/app-dialogs";
import { PageStack } from "@/app/components/page-stack";
import { WorkspaceMobileTool } from "@/app/components/workspace-mobile-tool";
import { WorkspaceSidePanel } from "@/app/components/workspace-side-panel";
import {
  WorkspaceMain,
  WorkspaceProjectRail,
  WorkspaceTerminal,
} from "@/app/components/workspace-shell";
import { DesktopTitleBar } from "@/components/workspace/desktop-title-bar";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

type AppShellProps = {
  app: AppController;
};

export function AppShell({ app }: AppShellProps) {
  const {
    isDesktop,
    showWindowChrome,
    useTitlebarSessionChrome,
    sidebarWidth,
    sidePanelWidth,
    view,
    workspace,
    hosts,
    hostLife,
    sessions,
    actions,
    projects,
    shells,
    androidBackground,
    sessionChrome,
    notificationCenter,
    connectHost,
    openFilesTab,
    changeFileText,
    saveFile,
    downloadFile,
    startForward,
    stopForward,
    getProjectPath,
  } = app;

  const { sessionHeader, sessionTabBar } = sessionChrome;

  const inWorkspace = workspace.page.name === "workspace";
  const sidePanelOpen =
    isDesktop &&
    !workspace.panelCollapsed &&
    inWorkspace &&
    view.selectedHost != null;

  return (
    <TooltipProvider>
      <SidebarProvider
        className="h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
        style={
          {
            "--sidebar-width": sidebarWidth.widthCss,
            "--titlebar-height": showWindowChrome ? "2.5rem" : "0px",
          } as CSSProperties
        }
        data-resizing={sidebarWidth.resizing ? "true" : undefined}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="relative flex min-h-0 w-full flex-1 flex-row overflow-hidden">
          {view.selectedHost ? (
            <WorkspaceProjectRail
              selectedHost={view.selectedHost}
              showRail={view.showProjectRail}
              sidebarWidth={sidebarWidth}
              projects={projects.projectsForHost(view.selectedHost.id)}
              activeProjectId={view.activeProjectId}
              activeWorktreePath={view.activeScopeWorktreePath}
              adhocActive={
                workspace.page.name === "workspace" &&
                workspace.page.scope.kind === "adhoc"
              }
              connected={
                view.selectedHost.status === "connected" ||
                view.selectedIsLocal
              }
              openWorkspaceIds={view.openWorkspaceIds}
              onShowHosts={workspace.openHosts}
              onOpenAdhoc={() => workspace.openAdhoc(view.selectedHost!.id)}
              onSelectWorktree={(projectId, worktreePath) =>
                workspace.openProject(
                  view.selectedHost!.id,
                  projectId,
                  worktreePath,
                )
              }
              onAddProject={() =>
                workspace.openAddProject(view.selectedHost!.id)
              }
              onEditProject={(projectId) =>
                workspace.openEditProject(view.selectedHost!.id, projectId)
              }
              onSetWorktree={(projectId, worktreePath) => {
                if (!view.selectedHost) return;
                void actions.handleSetProjectWorktree(
                  view.selectedHost.id,
                  projectId,
                  worktreePath,
                );
              }}
            />
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {showWindowChrome ? (
              <DesktopTitleBar
                showSidebarTrigger={isDesktop && view.showProjectRail}
                trailing={
                  isDesktop && view.selectedHost && inWorkspace ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={sidePanelOpen ? "Hide side panel" : "Show side panel"}
                      aria-expanded={sidePanelOpen}
                      onClick={workspace.togglePanel}
                      className="size-7 text-muted-foreground hover:text-foreground"
                    >
                      <PanelRight className="size-3.5" />
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
            <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <PageStack
              page={workspace.page}
              hosts={hosts.hosts}
              headerExtra={
                useTitlebarSessionChrome ? undefined : (
                  <NotificationBell {...notificationCenter} />
                )
              }
              projectsHost={view.projectsHost}
              projectsForHost={projects.projectsForHost}
              editingHost={view.editingHost}
              editingProject={view.editingProject}
              connectingId={hosts.connectingId}
              openWorkspaceIds={view.openWorkspaceIds}
              onSelectHost={workspace.openProjects}
              onAddHost={workspace.openAddHost}
              onOpenHosts={workspace.openHosts}
              onOpenAdhoc={workspace.openAdhoc}
              onOpenProject={(hostId, projectId) => {
                const project = projects
                  .projectsForHost(hostId)
                  .find((item) => item.id === projectId);
                workspace.openProject(
                  hostId,
                  projectId,
                  project?.activeWorktreePath ?? null,
                );
              }}
              onSelectProjectWorktree={(hostId, projectId, worktreePath) =>
                workspace.openProject(hostId, projectId, worktreePath)
              }
              onSetProjectWorktree={(hostId, projectId, worktreePath) => {
                void actions.handleSetProjectWorktree(
                  hostId,
                  projectId,
                  worktreePath,
                );
              }}
              onAddProject={workspace.openAddProject}
              onEditProject={workspace.openEditProject}
              onConnectHost={connectHost}
              onDisconnectHost={hostLife.requestDisconnect}
              onEditHost={workspace.openEditHost}
              onSaveHost={actions.handleSaveHost}
              onDeleteHost={actions.handleDeleteHost}
              onCloseHostForm={workspace.closeHostForm}
              onSaveProject={actions.handleSaveProject}
              onDeleteProject={actions.handleDeleteProject}
              onCloseProjectForm={workspace.closeProjectForm}
            />

            <WorkspaceMain
              selectedHost={view.selectedHost}
              pageIsWorkspace={workspace.page.name === "workspace"}
              forwardFormMode={workspace.forwardFormMode}
              editingForward={view.editingForward}
              useTitlebarSessionChrome={useTitlebarSessionChrome}
              sessionHeader={sessionHeader}
              sessionTabBar={sessionTabBar}
              editorOpen={view.editorOpen}
              activeTab={view.activeTab}
              openFileTabs={view.openFileTabs}
              selectedFiles={view.selectedFiles}
              onDeleteForward={actions.handleDeleteForward}
              onSaveForward={actions.handleSaveForward}
              onCloseForwardForm={workspace.closeForwardForm}
              onChangeFileText={changeFileText}
              onSaveFile={saveFile}
              onDownloadFile={downloadFile}
              onRevealFiles={openFilesTab}
            />

            <WorkspaceTerminal
              liveTerminals={view.liveTerminals}
              activeWorkspaceId={view.activeWorkspaceId}
              shellActiveSessionId={view.shellActiveSessionId}
              selectedSessions={view.selectedSessions}
              shellChromeOpen={view.shellVisible}
              selectedHost={view.selectedHost}
              projectRootPath={view.projectRootPath}
              onConnect={connectHost}
              onOpenShell={sessions.openShell}
              onSessionCwd={shells.setSessionCwd}
              getProjectPath={getProjectPath}
            />
            </SidebarInset>
              </div>

          {view.selectedHost && workspace.page.name === "workspace" ? (
            <WorkspaceSidePanel
              host={view.selectedHost}
              show
              collapsed={!isDesktop || workspace.panelCollapsed}
              activeTab={workspace.panelTab}
              widthPx={sidePanelWidth.widthPx}
              rootLabel={view.activeProject?.name ?? view.selectedHost.name}
              files={view.files}
              git={view.git}
              forwards={view.selectedForwards}
              selectedPath={
                view.activeTab?.kind === "file" ? view.activeTab.path : null
              }
              showPorts={!view.selectedIsLocal}
              onWidthChange={sidePanelWidth.setWidthPx}
              onResizeStart={sidePanelWidth.beginResize}
              onResizeEnd={sidePanelWidth.endResize}
              onSelectTab={workspace.selectPanelTab}
              onConnect={() => connectHost(view.selectedHost!.id)}
              onOpenFile={sessions.handleOpenFile}
              onAddForward={workspace.openAddForward}
              onEditForward={workspace.openEditForward}
              onStartForward={(id) => {
                const forward = view.selectedForwards.find(
                  (item) => item.id === id,
                );
                if (forward) startForward(view.selectedHost!.id, forward);
              }}
              onStopForward={(id) =>
                stopForward(view.selectedHost!.id, id)
              }
              onDeleteForward={(id) => void actions.handleDeleteForward(id)}
            />
          ) : null}
            </div>
          </div>

          {view.selectedHost &&
          !isDesktop &&
          workspace.mobileTool &&
          workspace.page.name === "workspace" ? (
            <WorkspaceMobileTool
              host={view.selectedHost}
              tool={workspace.mobileTool}
              show
              files={view.files}
              git={view.git}
              forwards={view.selectedForwards}
              showPorts={!view.selectedIsLocal}
              onClose={workspace.closeMobileTool}
              onConnect={() => connectHost(view.selectedHost!.id)}
              onOpenFile={sessions.handleOpenFile}
              onAddForward={workspace.openAddForward}
              onEditForward={workspace.openEditForward}
              onStartForward={(id) => {
                const forward = view.selectedForwards.find(
                  (item) => item.id === id,
                );
                if (forward) startForward(view.selectedHost!.id, forward);
              }}
              onStopForward={(id) =>
                stopForward(view.selectedHost!.id, id)
              }
              onDeleteForward={(id) => void actions.handleDeleteForward(id)}
            />
          ) : null}
        </div>

        <AppDialogs
          hostKeyError={hosts.hostKeyError}
          hostKeyBusy={hosts.connectingId !== null}
          onAcceptHostKey={() => void hosts.acceptHostKey()}
          onCancelHostKey={hosts.cancelHostKey}
          authCheck={hosts.authCheck}
          authCheckBusy={hosts.connectingId !== null}
          onCancelAuthCheck={() => void hosts.cancelAuthCheck()}
          disconnectPrompt={hostLife.disconnectPrompt}
          disconnectBusy={hostLife.disconnectBusy}
          onClearDisconnect={hostLife.clearDisconnectPrompt}
          onConfirmDisconnect={hostLife.confirmDisconnect}
          quitPrompt={hostLife.quitPrompt}
          quitBusy={hostLife.quitBusy}
          onClearQuit={hostLife.clearQuitPrompt}
          onConfirmQuit={hostLife.confirmQuit}
          discardTarget={sessions.discardTarget}
          onClearDiscard={sessions.clearDiscardTarget}
          onConfirmDiscard={sessions.confirmDiscardTab}
          shellCloseTarget={sessions.shellCloseTarget}
          onClearShellClose={sessions.clearShellCloseTarget}
          onConfirmShellClose={sessions.confirmCloseShell}
          backgroundSetupOpen={androidBackground.setupOpen}
          backgroundReadiness={androidBackground.readiness}
          backgroundBusy={androidBackground.setupBusy}
          onEnableBackground={() => void androidBackground.enableBackground()}
          onOpenBatterySettings={() =>
            void androidBackground.openBatterySettings()
          }
        />
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
