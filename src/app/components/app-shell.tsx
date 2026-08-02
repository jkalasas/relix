import type { CSSProperties } from "react";
import type { AppController } from "@/app/hooks/use-app-controller";
import { AppDialogs } from "@/app/components/app-dialogs";
import { PageStack } from "@/app/components/page-stack";
import {
  WorkspaceFileRail,
  WorkspaceMain,
  WorkspaceTerminal,
} from "@/app/components/workspace-shell";
import { DesktopTitleBar } from "@/components/workspace/desktop-title-bar";
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
        {showWindowChrome ? (
          <DesktopTitleBar
            showSidebarTrigger={isDesktop && view.showFileRail}
            trailing={useTitlebarSessionChrome ? sessionHeader : null}
          >
            {useTitlebarSessionChrome ? sessionTabBar : null}
          </DesktopTitleBar>
        ) : null}

        <div className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
          {view.selectedHost ? (
            <WorkspaceFileRail
              selectedHost={view.selectedHost}
              showFileRail={view.showFileRail}
              sidebarWidth={sidebarWidth}
              activeProject={view.activeProject}
              files={view.files}
              selectedPath={
                view.activeTab?.kind === "file" ? view.activeTab.path : null
              }
              onShowHosts={workspace.openHosts}
              onOpenFile={sessions.handleOpenFile}
            />
          ) : null}

          <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <PageStack
              page={workspace.page}
              hosts={hosts.hosts}
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
              onOpenProject={workspace.openProject}
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
              portsChromeOpen={view.portsChromeOpen}
              gitChromeOpen={view.gitChromeOpen}
              explorerChromeOpen={view.explorerChromeOpen}
              selectedForwards={view.selectedForwards}
              files={view.files}
              git={view.git}
              activeTab={view.activeTab}
              openFileTabs={view.openFileTabs}
              selectedFiles={view.selectedFiles}
              onConnect={connectHost}
              onAddForward={workspace.openAddForward}
              onEditForward={workspace.openEditForward}
              onStartForward={startForward}
              onStopForward={stopForward}
              onDeleteForward={actions.handleDeleteForward}
              onSaveForward={actions.handleSaveForward}
              onCloseForwardForm={workspace.closeForwardForm}
              onOpenFile={sessions.handleOpenFile}
              onChangeFileText={changeFileText}
              onSaveFile={saveFile}
              onDownloadFile={downloadFile}
              onOpenFiles={openFilesTab}
            />

            <WorkspaceTerminal
              liveTerminals={view.liveTerminals}
              activeWorkspaceId={view.activeWorkspaceId}
              shellActiveSessionId={view.shellActiveSessionId}
              shellChromeOpen={view.shellChromeOpen}
              selectedHost={view.selectedHost}
              projectRootPath={view.projectRootPath}
              onConnect={connectHost}
              onOpenShell={sessions.openShell}
              onSessionCwd={shells.setSessionCwd}
              getProjectPath={getProjectPath}
            />
          </SidebarInset>
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
