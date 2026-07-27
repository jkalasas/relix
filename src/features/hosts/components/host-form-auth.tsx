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
          <Field label="Private key">
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
          </Field>
          <Field label="Or key path">
            <Input
              value={form.privateKeyPath ?? ""}
              onChange={(e) => onUpdate("privateKeyPath", e.target.value)}
              placeholder="~/.ssh/id_ed25519"
              className="font-mono"
            />
          </Field>
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
