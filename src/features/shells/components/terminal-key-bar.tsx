import type { SyntheticEvent } from "react";
import {
  encodeSpecialKey,
  type StickyMods,
  type TerminalSpecialKey,
} from "@/features/shells/lib/terminal-keys";
import { cn } from "@/lib/utils";

type TerminalKeyBarProps = {
  mods: StickyMods;
  onToggleMod: (key: keyof StickyMods) => void;
  onSend: (data: string) => void;
};

type KeyDef =
  | { kind: "mod"; id: keyof StickyMods; label: string }
  | { kind: "special"; id: TerminalSpecialKey; label: string };

const ROW_ONE: KeyDef[] = [
  { kind: "special", id: "esc", label: "Esc" },
  { kind: "mod", id: "ctrl", label: "Ctrl" },
  { kind: "mod", id: "alt", label: "Alt" },
  { kind: "mod", id: "shift", label: "Shift" },
  { kind: "special", id: "tab", label: "Tab" },
];

const ROW_TWO: KeyDef[] = [
  { kind: "special", id: "left", label: "←" },
  { kind: "special", id: "up", label: "↑" },
  { kind: "special", id: "down", label: "↓" },
  { kind: "special", id: "right", label: "→" },
];

function keepTerminalFocus(event: SyntheticEvent) {
  event.preventDefault();
}

function KeyButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={active}
      onMouseDown={keepTerminalFocus}
      onPointerDown={keepTerminalFocus}
      onClick={onPress}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center justify-center rounded-md border font-mono text-xs font-medium transition-colors select-none",
        "active:translate-y-px",
        active
          ? "border-primary/50 bg-primary/20 text-primary"
          : "border-border/80 bg-elevated text-foreground/90 active:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function KeyRow({
  keys,
  mods,
  onToggleMod,
  onSpecial,
}: {
  keys: KeyDef[];
  mods: StickyMods;
  onToggleMod: (key: keyof StickyMods) => void;
  onSpecial: (key: TerminalSpecialKey) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {keys.map((key) =>
        key.kind === "mod" ? (
          <KeyButton
            key={key.id}
            label={key.label}
            active={mods[key.id]}
            onPress={() => onToggleMod(key.id)}
          />
        ) : (
          <KeyButton
            key={key.id}
            label={key.label}
            onPress={() => onSpecial(key.id)}
          />
        ),
      )}
    </div>
  );
}

export function TerminalKeyBar({
  mods,
  onToggleMod,
  onSend,
}: TerminalKeyBarProps) {
  const handleSpecial = (key: TerminalSpecialKey) => {
    onSend(encodeSpecialKey(key, mods));
  };

  return (
    <div
      className="shrink-0 border-t border-border bg-surface px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      role="toolbar"
      aria-label="Terminal keys"
    >
      <div className="flex flex-col gap-1.5">
        <KeyRow
          keys={ROW_ONE}
          mods={mods}
          onToggleMod={onToggleMod}
          onSpecial={handleSpecial}
        />
        <KeyRow
          keys={ROW_TWO}
          mods={mods}
          onToggleMod={onToggleMod}
          onSpecial={handleSpecial}
        />
      </div>
    </div>
  );
}
