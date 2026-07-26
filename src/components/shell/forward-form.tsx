import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ForwardType, PortForward, PortForwardConfig } from "@/lib/types";

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

function descriptionFor(type: ForwardType): string {
  if (type === "R") {
    return "Remote forward (R) — listen on the SSH host and forward to a target on this machine.";
  }
  if (type === "D") {
    return "Dynamic SOCKS (D) — SOCKS5 proxy on this machine through the session.";
  }
  return "Local forward (L) — bind a port on this machine to a host reachable from the remote session.";
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

  function validate(): string | null {
    if (!form.localHost.trim()) {
      return form.type === "R"
        ? "Local target host is required"
        : "Local bind host is required";
    }
    if (
      !Number.isInteger(form.localPort) ||
      form.localPort < 1 ||
      form.localPort > 65535
    ) {
      return form.type === "R"
        ? "Local target port must be between 1 and 65535"
        : "Local port must be between 1 and 65535";
    }
    if (form.type === "D") return null;
    if (!form.remoteHost.trim()) {
      return form.type === "R"
        ? "Remote listen host is required"
        : "Remote host is required";
    }
    if (
      !Number.isInteger(form.remotePort) ||
      form.remotePort < 1 ||
      form.remotePort > 65535
    ) {
      return form.type === "R"
        ? "Remote listen port must be between 1 and 65535"
        : "Remote port must be between 1 and 65535";
    }
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    onSave({
      id: form.id,
      type: form.type,
      localHost: form.localHost.trim(),
      localPort: form.localPort,
      remoteHost: form.type === "D" ? "" : form.remoteHost.trim(),
      remotePort: form.type === "D" ? 0 : form.remotePort,
      autoStart: form.autoStart,
    });
  }

  const showRemote = form.type !== "D";
  const localHostLabel =
    form.type === "R" ? "Local target host" : "Local bind host";
  const localPortLabel = form.type === "R" ? "Local target port" : "Local port";
  const remoteHostLabel =
    form.type === "R" ? "Remote listen host" : "Remote host";
  const remotePortLabel =
    form.type === "R" ? "Remote listen port" : "Remote port";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 pt-[env(safe-area-inset-top)] md:pt-0">
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

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <p className="text-[13px] text-muted-foreground">
          {descriptionFor(form.type)}
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

        {form.type === "R" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={remoteHostLabel}>
                <Input
                  value={form.remoteHost}
                  onChange={(e) => update("remoteHost", e.target.value)}
                  placeholder="127.0.0.1"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Field label={remotePortLabel}>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.remotePort}
                  onChange={(e) => update("remotePort", Number(e.target.value))}
                  className="font-mono"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={localHostLabel}>
                <Input
                  value={form.localHost}
                  onChange={(e) => update("localHost", e.target.value)}
                  placeholder="127.0.0.1"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Field label={localPortLabel}>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.localPort}
                  onChange={(e) => update("localPort", Number(e.target.value))}
                  className="font-mono"
                />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={localHostLabel}>
                <Input
                  value={form.localHost}
                  onChange={(e) => update("localHost", e.target.value)}
                  placeholder="127.0.0.1"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Field label={localPortLabel}>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.localPort}
                  onChange={(e) => update("localPort", Number(e.target.value))}
                  className="font-mono"
                />
              </Field>
            </div>
            {showRemote ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={remoteHostLabel}>
                  <Input
                    value={form.remoteHost}
                    onChange={(e) => update("remoteHost", e.target.value)}
                    placeholder="127.0.0.1"
                    autoComplete="off"
                    className="font-mono"
                  />
                </Field>
                <Field label={remotePortLabel}>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.remotePort}
                    onChange={(e) =>
                      update("remotePort", Number(e.target.value))
                    }
                    className="font-mono"
                  />
                </Field>
              </div>
            ) : null}
          </>
        )}

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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
