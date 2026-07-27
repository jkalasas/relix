import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { FileKey } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/workspace/field";
import { cn } from "@/lib/utils";
import type { AuthMethod, HostConfig } from "@/features/hosts/types";

const AUTH_METHODS = [
  { id: "password" as AuthMethod, label: "Password" },
  { id: "private_key" as AuthMethod, label: "Private key" },
] as const;

type HostFormAuthProps = {
  form: HostConfig;
  onUpdate: <K extends keyof HostConfig>(key: K, value: HostConfig[K]) => void;
};

export function HostFormAuth({ form, onUpdate }: HostFormAuthProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function importPrivateKey() {
    setImportError(null);
    setImporting(true);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Import private key",
        filters: [
          {
            name: "SSH private key",
            extensions: ["*", "pem", "key", "pub", "id_ed25519", "id_rsa"],
          },
        ],
      });
      if (selected == null) return;
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      const body = await readTextFile(path);
      onUpdate("privateKey", body);
      onUpdate("privateKeyPath", undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not import key file";
      setImportError(message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <fieldset className="space-y-2">
        <legend className="text-[11px] font-medium text-muted-foreground">
          Auth method
        </legend>
        <div className="flex gap-2">
          {AUTH_METHODS.map((method) => (
            <Button
              key={method.id}
              type="button"
              size="sm"
              variant={form.authMethod === method.id ? "default" : "outline"}
              onClick={() => onUpdate("authMethod", method.id)}
              className="min-h-9 px-3 md:min-h-7"
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
            onChange={(e) => onUpdate("password", e.target.value)}
            autoComplete="current-password"
          />
        </Field>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Private key
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void importPrivateKey()}
              disabled={importing}
              className="min-h-9 px-3 md:min-h-7"
            >
              <FileKey data-icon="inline-start" />
              {importing ? "Importing…" : "Import key"}
            </Button>
          </div>
          <textarea
            value={form.privateKey ?? ""}
            onChange={(e) => onUpdate("privateKey", e.target.value)}
            rows={6}
            spellCheck={false}
            className={cn(
              "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-base md:text-sm",
              "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          />
          {importError ? (
            <p className="text-[13px] text-destructive" role="alert">
              {importError}
            </p>
          ) : null}
          <div className="hidden md:block">
            <Field label="Or key path">
              <Input
                value={form.privateKeyPath ?? ""}
                onChange={(e) => onUpdate("privateKeyPath", e.target.value)}
                placeholder="~/.ssh/id_ed25519"
                className="font-mono"
              />
            </Field>
          </div>
          <Field label="Passphrase">
            <Input
              type="password"
              value={form.passphrase ?? ""}
              onChange={(e) => onUpdate("passphrase", e.target.value)}
              autoComplete="off"
            />
          </Field>
        </>
      )}
    </>
  );
}
