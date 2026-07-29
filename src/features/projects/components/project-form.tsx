import { useEffect, useMemo, useState } from "react";
import {
  ChevronUp,
  FolderOpen,
  FolderPlus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/workspace/field";
import { FileTypeIcon } from "@/features/files/file-icon";
import { basename, parentPath } from "@/features/files/format";
import { useFiles } from "@/features/files/use-files";
import { isLocalHost } from "@/features/hosts/local-host";
import type { Host } from "@/features/hosts/types";
import type { ProjectConfig } from "@/features/projects/types";
import {
  normalizeProjectConfig,
  validateProjectConfig,
} from "@/features/projects/validate";
import { cn } from "@/lib/utils";

type ProjectFormProps = {
  host: Host;
  initial?: ProjectConfig | null;
  initialPath?: string | null;
  connecting?: boolean;
  onConnect?: () => void;
  onSave: (config: ProjectConfig) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
};

function emptyProject(hostId: string, path = ""): ProjectConfig {
  return {
    id: crypto.randomUUID(),
    hostId,
    name: "",
    path,
  };
}

function defaultNameForPath(path: string): string {
  const name = basename(path).trim();
  if (!name || name === "." || name === "/" || name === "\\") return "";
  return name;
}

export function ProjectForm({
  host,
  initial,
  initialPath,
  connecting = false,
  onConnect,
  onSave,
  onCancel,
  onDelete,
}: ProjectFormProps) {
  const isEdit = Boolean(initial);
  const seedPath = (initial?.path || initialPath || "").trim();
  const [form, setForm] = useState<ProjectConfig>(() => {
    if (initial) return initial;
    const path = seedPath;
    return {
      ...emptyProject(host.id, path),
      name: defaultNameForPath(path),
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameTouched, setNameTouched] = useState(Boolean(initial?.name));

  const connected = host.status === "connected" || isLocalHost(host);
  const files = useFiles({
    hostId: host.id,
    connected,
    enabled: connected,
    // Seed browser location once; do not lock with rootPath so user can navigate.
    shellCwd: seedPath || null,
  });

  const directories = useMemo(
    () => files.entries.filter((entry) => entry.isDir),
    [files.entries],
  );

  const upPath = parentPath(files.path);
  const pathLabel = isLocalHost(host)
    ? files.path
    : `${host.user}@${host.hostname}:${files.path}`;

  useEffect(() => {
    if (!connected) return;
    if (!files.path || files.path === ".") return;
    setForm((current) => {
      if (current.path === files.path) return current;
      const nextName =
        !nameTouched || !current.name.trim()
          ? defaultNameForPath(files.path) || current.name
          : current.name;
      return { ...current, path: files.path, name: nextName };
    });
  }, [connected, files.path, nameTouched]);

  function updateName(value: string) {
    setNameTouched(true);
    setForm((current) => ({ ...current, name: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const path = (form.path || files.path || "").trim();
    const next = { ...form, hostId: host.id, path };
    const nextError = validateProjectConfig(next);
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    onSave(normalizeProjectConfig(next));
  }

  const title = isEdit ? "Edit project" : "Add project";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="shrink-0">
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a directory on {host.name}. Shells open there; files stay
            rooted at that path.
          </p>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={handleSubmit}
        >
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) => updateName(event.target.value)}
              placeholder="api"
              autoFocus
            />
          </Field>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                Directory
              </span>
              {connected ? (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {pathLabel}
                </span>
              ) : null}
            </div>

            {!connected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Connect to browse directories on this host.
                </p>
                {onConnect ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onConnect}
                    disabled={connecting}
                  >
                    {connecting ? "Connecting…" : "Connect"}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
                <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!upPath || files.loading}
                    onClick={() => {
                      if (upPath) files.openDir(upPath);
                    }}
                    aria-label="Parent directory"
                    className="size-8"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={files.loading}
                    onClick={() => void files.refresh()}
                    aria-label="Refresh"
                    className="size-8"
                  >
                    <RefreshCw
                      className={cn(
                        "size-3.5",
                        files.loading && "animate-spin",
                      )}
                    />
                  </Button>
                  <p className="min-w-0 flex-1 truncate px-1 font-mono text-[12px] text-foreground">
                    {files.path || "."}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={files.loading}
                    onClick={() => void files.mkdir()}
                    aria-label="New folder"
                    className="size-8"
                  >
                    <FolderPlus className="size-3.5" />
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {files.error ? (
                    <p className="px-3 py-4 text-sm text-destructive">
                      {files.error}
                    </p>
                  ) : directories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <FolderOpen className="size-5 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {files.loading
                          ? "Loading…"
                          : "No subfolders here. Use this directory, or go up."}
                      </p>
                    </div>
                  ) : (
                    <ul aria-label="Directories">
                      {directories.map((entry) => (
                        <li key={entry.path}>
                          <button
                            type="button"
                            className="flex min-h-11 w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-elevated md:min-h-9"
                            onClick={() => files.openDir(entry.path)}
                          >
                            <FileTypeIcon name={entry.name} isDir />
                            <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                              {entry.name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="shrink-0 border-t border-border px-3 py-2">
                  <p className="font-mono text-[12px] text-muted-foreground">
                    Selected:{" "}
                    <span className="text-foreground">
                      {files.path || form.path || "—"}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {error ? (
            <p className="shrink-0 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Button type="submit" size="sm" disabled={!connected && !form.path}>
              {isEdit ? "Save project" : "Create project"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            {isEdit && onDelete ? (
              confirmDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  onClick={() => onDelete(form.id)}
                >
                  Confirm delete
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
