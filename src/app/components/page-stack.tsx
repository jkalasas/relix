import type { ReactNode } from "react";
import type { AppPage } from "@/app/types";
import { HostForm, type Host, type HostConfig } from "@/features/hosts";
import {
  HostsPage,
  ProjectForm,
  ProjectsPage,
  type ProjectConfig,
} from "@/features/projects";

type PageStackProps = {
  page: AppPage;
  hosts: Host[];
  projectsHost: Host | null;
  projectsForHost: (hostId: string) => ProjectConfig[];
  editingHost: Host | null;
  editingProject: ProjectConfig | null;
  connectingId: string | null;
  openWorkspaceIds: Set<string>;
  headerExtra?: ReactNode;
  onSelectHost: (id: string) => void;
  onAddHost: () => void;
  onOpenHosts: () => void;
  onOpenAdhoc: (hostId: string) => void;
  onOpenProject: (hostId: string, projectId: string) => void;
  onAddProject: (hostId: string) => void;
  onEditProject: (hostId: string, projectId: string) => void;
  onConnectHost: (hostId: string) => void;
  onDisconnectHost: (host: Host) => void;
  onEditHost: (hostId: string) => void;
  onSaveHost: (config: HostConfig) => void;
  onDeleteHost: (id: string) => void;
  onCloseHostForm: () => void;
  onSaveProject: (config: ProjectConfig) => Promise<void>;
  onDeleteProject: (hostId: string, projectId: string) => Promise<void>;
  onCloseProjectForm: () => void;
};

export function PageStack({
  page,
  hosts,
  projectsHost,
  projectsForHost,
  editingHost,
  editingProject,
  connectingId,
  openWorkspaceIds,
  headerExtra,
  onSelectHost,
  onAddHost,
  onOpenHosts,
  onOpenAdhoc,
  onOpenProject,
  onAddProject,
  onEditProject,
  onConnectHost,
  onDisconnectHost,
  onEditHost,
  onSaveHost,
  onDeleteHost,
  onCloseHostForm,
  onSaveProject,
  onDeleteProject,
  onCloseProjectForm,
}: PageStackProps) {
  return (
    <>
      {page.name === "hosts" ? (
        <HostsPage
          hosts={hosts}
          onSelect={onSelectHost}
          onAddHost={onAddHost}
          headerExtra={headerExtra}
        />
      ) : null}

      {page.name === "projects" ? (
        projectsHost ? (
          <ProjectsPage
            host={projectsHost}
            projects={projectsForHost(projectsHost.id)}
            connecting={connectingId === projectsHost.id}
            openWorkspaceIds={openWorkspaceIds}
            onBack={onOpenHosts}
            onOpenAdhoc={() => onOpenAdhoc(projectsHost.id)}
            onOpenProject={(projectId) =>
              onOpenProject(projectsHost.id, projectId)
            }
            onAddProject={() => onAddProject(projectsHost.id)}
            onEditProject={(projectId) =>
              onEditProject(projectsHost.id, projectId)
            }
            onConnect={() => onConnectHost(projectsHost.id)}
            onDisconnect={() => onDisconnectHost(projectsHost)}
            onEditHost={() => onEditHost(projectsHost.id)}
            headerExtra={headerExtra}
          />
        ) : (
          <HostsPage
            hosts={hosts}
            onSelect={onSelectHost}
            onAddHost={onAddHost}
            headerExtra={headerExtra}
          />
        )
      ) : null}

      {page.name === "host-form" ? (
        <HostForm
          initial={editingHost}
          onSave={(config) => void onSaveHost(config)}
          onCancel={onCloseHostForm}
          onDelete={
            page.mode === "edit" && page.hostId
              ? (id) => void onDeleteHost(id)
              : undefined
          }
        />
      ) : null}

      {page.name === "project-form" && projectsHost ? (
        <ProjectForm
          host={projectsHost}
          initial={editingProject}
          initialPath={
            page.mode === "add" ? page.initialPath : editingProject?.path
          }
          connecting={connectingId === projectsHost.id}
          onConnect={() => onConnectHost(projectsHost.id)}
          onSave={onSaveProject}
          onCancel={onCloseProjectForm}
          onDelete={
            page.mode === "edit"
              ? (id) => onDeleteProject(page.hostId, id)
              : undefined
          }
        />
      ) : null}
    </>
  );
}
