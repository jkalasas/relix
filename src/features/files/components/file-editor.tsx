import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { languageExtensionFor } from "@/features/files/language";
import { cn } from "@/lib/utils";

type FileEditorProps = {
  path: string;
  name: string;
  value: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onBack: () => void;
};

export function FileEditor({
  path,
  name,
  value,
  dirty,
  saving,
  error,
  onChange,
  onSave,
  onBack,
}: FileEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!parentRef.current) return;

    const language = languageExtensionFor(name);
    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      oneDark,
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "13px",
          fontFamily: "var(--font-mono)",
          backgroundColor: "transparent",
        },
        ".cm-scroller": {
          fontFamily: "var(--font-mono)",
          overflow: "auto",
        },
        ".cm-content": {
          caretColor: "var(--foreground)",
          paddingBottom: "2rem",
        },
        ".cm-gutters": {
          backgroundColor: "transparent",
          border: "none",
          color: "var(--muted-foreground)",
        },
        "&.cm-focused": {
          outline: "none",
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      ...(language ? [language] : []),
    ];

    const state = EditorState.create({
      doc: valueRef.current,
      extensions,
    });
    const view = new EditorView({
      state,
      parent: parentRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // remount only when the remote file identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, name]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [value]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving) onSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, onSave, saving]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4 md:min-h-10">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onBack}
          className="min-h-9 shrink-0 md:min-h-7"
          aria-label="Back to files"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {path}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={!dirty || saving}
          className="min-h-9 shrink-0 md:min-h-7"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? (
        <p
          className="border-b border-border bg-surface px-4 py-2 text-[13px] text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div
        ref={parentRef}
        className={cn("min-h-0 flex-1 overflow-hidden bg-background")}
      />
    </div>
  );
}
