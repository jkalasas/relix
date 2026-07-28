import { lazy, Suspense, useState, type ReactNode } from "react";
import { FileBinaryView } from "@/features/files/components/file-binary-view";
import { FileImageViewer } from "@/features/files/components/file-image-viewer";
import type { OpenFileState } from "@/features/session-tabs";
import { parseSshError } from "@/features/ssh/errors";

const FileEditor = lazy(() =>
  import("@/features/files/components/file-editor").then((mod) => ({
    default: mod.FileEditor,
  })),
);
const FilePdfViewer = lazy(() =>
  import("@/features/files/components/file-pdf-viewer").then((mod) => ({
    default: mod.FilePdfViewer,
  })),
);

function ViewerFallback({ label }: { label: string }) {
  return (
    <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
      {label}
    </p>
  );
}

type FileWorkspaceProps = {
  state: OpenFileState;
  onChangeText: (text: string) => void;
  onSave: () => Promise<void>;
  onDownload: () => void;
  onRevealFiles: () => void;
};

export function FileWorkspace({
  state,
  onChangeText,
  onSave,
  onDownload,
  onRevealFiles,
}: FileWorkspaceProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (state.status === "loading") {
    return (
      <div
        role="tabpanel"
        id={`session-panel-file:${state.path}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4 md:min-h-10">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {state.path}
          </p>
        </div>
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          Opening…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        role="tabpanel"
        id={`session-panel-file:${state.path}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <FileBinaryView
          path={state.path}
          name={state.name}
          message={state.message}
          onBack={onRevealFiles}
          onDownload={onDownload}
        />
      </div>
    );
  }

  const { file } = state;
  let body: ReactNode = null;

  if (file.kind === "text") {
    body = (
      <Suspense fallback={<ViewerFallback label="Loading editor…" />}>
        <FileEditor
          path={file.entry.path}
          name={file.entry.name}
          value={state.text}
          dirty={state.dirty}
          saving={saving}
          error={saveError}
          onChange={onChangeText}
          onSave={() => {
            setSaving(true);
            setSaveError(null);
            void onSave()
              .catch((err) => {
                setSaveError(parseSshError(err).message);
              })
              .finally(() => {
                setSaving(false);
              });
          }}
          onBack={onRevealFiles}
        />
      </Suspense>
    );
  } else if (file.kind === "image") {
    body = (
      <FileImageViewer
        path={file.entry.path}
        name={file.entry.name}
        bytes={file.bytes}
        onBack={onRevealFiles}
      />
    );
  } else if (file.kind === "pdf") {
    body = (
      <Suspense fallback={<ViewerFallback label="Loading PDF…" />}>
        <FilePdfViewer
          path={file.entry.path}
          name={file.entry.name}
          bytes={file.bytes}
          onBack={onRevealFiles}
        />
      </Suspense>
    );
  } else {
    body = (
      <FileBinaryView
        path={file.entry.path}
        name={file.entry.name}
        message="This file is not a text, image, or PDF preview."
        onBack={onRevealFiles}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div
      role="tabpanel"
      id={`session-panel-file:${state.path}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      {body}
    </div>
  );
}
