import { Input } from "@/components/ui/input";
import { Field } from "@/components/workspace/field";
import type { PortForwardConfig } from "@/features/forwards/types";

type ForwardTypeFieldsProps = {
  form: PortForwardConfig;
  onUpdate: <K extends keyof PortForwardConfig>(
    key: K,
    value: PortForwardConfig[K],
  ) => void;
};

export function ForwardTypeFields({ form, onUpdate }: ForwardTypeFieldsProps) {
  const showRemote = form.type !== "D";
  const localHostLabel =
    form.type === "R" ? "Local target host" : "Local bind host";
  const localPortLabel = form.type === "R" ? "Local target port" : "Local port";
  const remoteHostLabel =
    form.type === "R" ? "Remote listen host" : "Remote host";
  const remotePortLabel =
    form.type === "R" ? "Remote listen port" : "Remote port";

  if (form.type === "R") {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={remoteHostLabel}>
            <Input
              value={form.remoteHost}
              onChange={(e) => onUpdate("remoteHost", e.target.value)}
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
              onChange={(e) => onUpdate("remotePort", Number(e.target.value))}
              className="font-mono"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={localHostLabel}>
            <Input
              value={form.localHost}
              onChange={(e) => onUpdate("localHost", e.target.value)}
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
              onChange={(e) => onUpdate("localPort", Number(e.target.value))}
              className="font-mono"
            />
          </Field>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={localHostLabel}>
          <Input
            value={form.localHost}
            onChange={(e) => onUpdate("localHost", e.target.value)}
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
            onChange={(e) => onUpdate("localPort", Number(e.target.value))}
            className="font-mono"
          />
        </Field>
      </div>
      {showRemote ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={remoteHostLabel}>
            <Input
              value={form.remoteHost}
              onChange={(e) => onUpdate("remoteHost", e.target.value)}
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
              onChange={(e) => onUpdate("remotePort", Number(e.target.value))}
              className="font-mono"
            />
          </Field>
        </div>
      ) : null}
    </>
  );
}
