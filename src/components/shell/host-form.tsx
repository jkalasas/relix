import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AuthMethod, Host, HostConfig } from "@/lib/types";

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

  function validate(): string | null {
    if (!form.name.trim()) return "Name is required";
    if (!form.user.trim()) return "User is required";
    if (!form.hostname.trim()) return "Hostname is required";
    if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) {
      return "Port must be between 1 and 65535";
    }
    if (form.authMethod === "password" && !form.password?.trim()) {
      return "Password is required";
    }
    if (
      form.authMethod === "private_key" &&
      !form.privateKey?.trim() &&
      !form.privateKeyPath?.trim()
    ) {
      return "Private key or key path is required";
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
    const config: HostConfig = {
      ...form,
      name: form.name.trim(),
      user: form.user.trim(),
      hostname: form.hostname.trim(),
      password:
        form.authMethod === "password" ? form.password?.trim() : undefined,
      privateKey:
        form.authMethod === "private_key"
          ? form.privateKey?.trim() || undefined
          : undefined,
      privateKeyPath:
        form.authMethod === "private_key"
          ? form.privateKeyPath?.trim() || undefined
          : undefined,
      passphrase:
        form.authMethod === "private_key"
          ? form.passphrase?.trim() || undefined
          : undefined,
    };
    onSave(config);
  }

  const authMethods = useMemo(
    () =>
      [
        { id: "password" as AuthMethod, label: "Password" },
        { id: "private_key" as AuthMethod, label: "Private key" },
      ] as const,
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 pt-[env(safe-area-inset-top)] md:pt-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
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

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-medium text-muted-foreground">
            Auth method
          </legend>
          <div className="flex gap-2">
            {authMethods.map((method) => (
              <Button
                key={method.id}
                type="button"
                size="sm"
                variant={form.authMethod === method.id ? "default" : "outline"}
                onClick={() => update("authMethod", method.id)}
              >
                {method.label}
              </Button>
            ))}
          </div>
        </fieldset>

        {form.authMethod === "password" ? (
          <Field label="Password">
            <Input
              type="password"
              value={form.password ?? ""}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="current-password"
            />
          </Field>
        ) : (
          <>
            <Field label="Private key">
              <textarea
                value={form.privateKey ?? ""}
                onChange={(e) => update("privateKey", e.target.value)}
                rows={6}
                spellCheck={false}
                className={cn(
                  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm",
                  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              />
            </Field>
            <Field label="Or key path">
              <Input
                value={form.privateKeyPath ?? ""}
                onChange={(e) => update("privateKeyPath", e.target.value)}
                placeholder="~/.ssh/id_ed25519"
                className="font-mono"
              />
            </Field>
            <Field label="Passphrase">
              <Input
                type="password"
                value={form.passphrase ?? ""}
                onChange={(e) => update("passphrase", e.target.value)}
                autoComplete="off"
              />
            </Field>
          </>
        )}

        {error ? (
          <p className="text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Button type="submit" size="sm">
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
                >
                  Confirm delete
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
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
