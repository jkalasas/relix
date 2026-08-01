import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/workspace/field";
import { HostFormAuth } from "@/features/hosts/components/host-form-auth";
import type { Host, HostConfig, ShellMode } from "@/features/hosts/types";
import {
  normalizeHostConfig,
  validateHostConfig,
} from "@/features/hosts/lib/validate";

const SHELL_MODES = [
  { id: "plain" as ShellMode, label: "Plain" },
  { id: "tmux" as ShellMode, label: "Tmux" },
] as const;

type HostFormProps = {
  initial?: Host | null;
  onSave: (config: HostConfig) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
};

function emptyConfig(): HostConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    user: "",
    hostname: "",
    port: 22,
    authMethod: "password",
    password: "",
    privateKey: "",
    privateKeyPath: "",
    passphrase: "",
    shellMode: "plain",
    tmuxSession: "",
  };
}

export function HostForm({ initial, onSave, onCancel, onDelete }: HostFormProps) {
  const [form, setForm] = useState<HostConfig>(() =>
    initial
      ? {
          id: initial.id,
          name: initial.name,
          user: initial.user,
          hostname: initial.hostname,
          port: initial.port,
          authMethod: initial.authMethod,
          password: initial.password ?? "",
          privateKey: initial.privateKey ?? "",
          privateKeyPath: initial.privateKeyPath ?? "",
          passphrase: initial.passphrase ?? "",
          shellMode: initial.shellMode ?? "plain",
          tmuxSession: initial.tmuxSession ?? "",
        }
      : emptyConfig(),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = Boolean(initial);
  const title = isEdit ? "Edit host" : "Add host";

  function update<K extends keyof HostConfig>(key: K, value: HostConfig[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextError = validateHostConfig(form);
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    onSave(normalizeHostConfig(form));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="shrink-0 border-b border-border">
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
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="bastion-prod"
            autoComplete="off"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="User">
            <Input
              value={form.user}
              onChange={(e) => update("user", e.target.value)}
              placeholder="deploy"
              autoComplete="username"
              className="font-mono"
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => update("port", Number(e.target.value))}
              className="font-mono"
            />
          </Field>
        </div>
        <Field label="Hostname">
          <Input
            value={form.hostname}
            onChange={(e) => update("hostname", e.target.value)}
            placeholder="bastion.example.com"
            autoComplete="off"
            className="font-mono"
          />
        </Field>

        <HostFormAuth form={form} onUpdate={update} />

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-medium text-muted-foreground">
            Shell
          </legend>
          <div className="flex gap-2">
            {SHELL_MODES.map((mode) => (
              <Button
                key={mode.id}
                type="button"
                size="sm"
                variant={
                  (form.shellMode ?? "plain") === mode.id
                    ? "default"
                    : "outline"
                }
                onClick={() => update("shellMode", mode.id)}
                className="min-h-9 px-3 md:min-h-7"
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </fieldset>

        {(form.shellMode ?? "plain") === "tmux" ? (
          <Field label="Tmux session">
            <Input
              value={form.tmuxSession ?? ""}
              onChange={(e) => update("tmuxSession", e.target.value)}
              placeholder="relix"
              autoComplete="off"
              className="font-mono"
            />
          </Field>
        ) : null}

        {error ? (
          <p className="text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Button type="submit" size="sm" className="min-h-9 px-3 md:min-h-7">
            {isEdit ? "Save host" : "Add host"}
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
