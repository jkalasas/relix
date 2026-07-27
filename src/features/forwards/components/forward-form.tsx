import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ForwardTypeFields } from "@/features/forwards/components/forward-type-fields";
import type {
  ForwardType,
  PortForward,
  PortForwardConfig,
} from "@/features/forwards/types";
import {
  descriptionForForwardType,
  normalizeForwardConfig,
  validateForwardConfig,
} from "@/features/forwards/validate";

type ForwardFormProps = {
  initial?: PortForward | null;
  onSave: (config: PortForwardConfig) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
};

function emptyConfig(): PortForwardConfig {
  return {
    id: crypto.randomUUID(),
    type: "L",
    localHost: "127.0.0.1",
    localPort: 8080,
    remoteHost: "127.0.0.1",
    remotePort: 8080,
    autoStart: true,
  };
}

export function ForwardForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: ForwardFormProps) {
  const [form, setForm] = useState<PortForwardConfig>(() =>
    initial
      ? {
          id: initial.id,
          type: initial.type,
          localHost: initial.localHost,
          localPort: initial.localPort,
          remoteHost: initial.remoteHost,
          remotePort: initial.remotePort,
          autoStart: initial.autoStart,
        }
      : emptyConfig(),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = Boolean(initial);
  const title = isEdit ? "Edit tunnel" : "New tunnel";

  const forwardTypes = useMemo(
    () =>
      [
        { id: "L" as ForwardType, label: "Local (L)" },
        { id: "R" as ForwardType, label: "Remote (R)" },
        { id: "D" as ForwardType, label: "Dynamic (D)" },
      ] as const,
    [],
  );

  function update<K extends keyof PortForwardConfig>(
    key: K,
    value: PortForwardConfig[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextError = validateForwardConfig(form);
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    onSave(normalizeForwardConfig(form));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="shrink-0 border-b border-border pt-[env(safe-area-inset-top,0px)] md:pt-0">
        <div className="flex h-12 items-center justify-between px-4">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="min-h-9 px-3 md:min-h-7"
          >
            Cancel
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <p className="text-[13px] text-muted-foreground">
          {descriptionForForwardType(form.type)}
        </p>

        <div className="flex flex-wrap gap-2">
          {forwardTypes.map((method) => (
            <Button
              key={method.id}
              type="button"
              size="sm"
              variant={form.type === method.id ? "default" : "outline"}
              onClick={() => update("type", method.id)}
              className="min-h-9 px-3 md:min-h-7"
            >
              {method.label}
            </Button>
          ))}
        </div>

        <ForwardTypeFields form={form} onUpdate={update} />

        {form.type === "L" || form.type === "D" ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 md:min-h-9">
            <input
              type="checkbox"
              checked={form.localHost === "0.0.0.0"}
              onChange={(e) =>
                update("localHost", e.target.checked ? "0.0.0.0" : "127.0.0.1")
              }
              className="size-4 accent-[var(--primary)]"
            />
            <span className="text-[13px] text-foreground">
              Listen on all interfaces (0.0.0.0)
            </span>
          </label>
        ) : null}

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 md:min-h-9">
          <input
            type="checkbox"
            checked={form.autoStart}
            onChange={(e) => update("autoStart", e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          <span className="text-[13px] text-foreground">
            Auto-start when host connects
          </span>
        </label>

        {error ? (
          <p className="text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Button type="submit" size="sm" className="min-h-9 px-3 md:min-h-7">
            {isEdit ? "Save tunnel" : "Add tunnel"}
          </Button>
          {isEdit && onDelete ? (
            confirmDelete ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => onDelete(form.id)}
                  className="min-h-9 px-3 md:min-h-7"
                >
                  Confirm delete
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-9 px-3 md:min-h-7"
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                className="min-h-9 px-3 md:min-h-7"
              >
                Delete
              </Button>
            )
          ) : null}
        </div>
      </form>
    </div>
  );
}
