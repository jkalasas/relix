import type { ComponentType } from "react";
import {
  Braces,
  Code2,
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Settings2,
  Terminal,
} from "lucide-react";
import { extensionOf } from "@/features/files/file-kind";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type FileIconSpec = {
  icon: IconComponent;
  className: string;
};

function iconForName(name: string): FileIconSpec {
  const lower = name.toLowerCase();
  const ext = extensionOf(name);

  if (
    lower === "dockerfile" ||
    lower === "makefile" ||
    lower === "procfile" ||
    lower === "gemfile"
  ) {
    return { icon: Settings2, className: "text-muted-foreground" };
  }
  if (
    lower === "license" ||
    lower === "copying" ||
    lower === "authors" ||
    lower === "changelog" ||
    lower === "readme" ||
    lower.startsWith("readme.")
  ) {
    return { icon: FileText, className: "text-status-tunnel" };
  }

  switch (ext) {
    case "md":
    case "markdown":
    case "mdx":
    case "rst":
    case "txt":
    case "log":
      return { icon: FileText, className: "text-status-tunnel" };
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return { icon: FileCode2, className: "text-primary" };
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return { icon: FileCode2, className: "text-status-tunnel" };
    case "json":
    case "jsonc":
    case "json5":
      return { icon: FileJson, className: "text-status-transfer" };
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "cfg":
    case "conf":
    case "env":
    case "properties":
      return { icon: Settings2, className: "text-muted-foreground" };
    case "lock":
    case "sum":
      return { icon: Braces, className: "text-muted-foreground" };
    case "html":
    case "htm":
    case "xhtml":
    case "vue":
    case "svelte":
    case "css":
    case "scss":
    case "sass":
    case "less":
      return { icon: Code2, className: "text-status-connected" };
    case "py":
    case "pyi":
    case "rb":
    case "php":
    case "go":
    case "rs":
    case "java":
    case "kt":
    case "kts":
    case "swift":
    case "c":
    case "h":
    case "cc":
    case "cpp":
    case "cxx":
    case "hpp":
    case "cs":
      return { icon: FileCode2, className: "text-status-connected" };
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
    case "ps1":
    case "bat":
    case "cmd":
      return { icon: Terminal, className: "text-muted-foreground" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
    case "svg":
    case "ico":
    case "avif":
      return { icon: FileImage, className: "text-status-connected" };
    case "pdf":
      return { icon: FileText, className: "text-destructive" };
    default:
      return { icon: File, className: "text-muted-foreground" };
  }
}

type FileTypeIconProps = {
  name: string;
  isDir?: boolean;
  open?: boolean;
  className?: string;
};

export function FileTypeIcon({
  name,
  isDir = false,
  open = false,
  className,
}: FileTypeIconProps) {
  if (isDir) {
    const Icon = open ? FolderOpen : Folder;
    return (
      <Icon
        className={cn("size-4 shrink-0 text-status-transfer", className)}
        aria-hidden
      />
    );
  }

  const { icon: Icon, className: tone } = iconForName(name);
  return <Icon className={cn("size-4 shrink-0", tone, className)} aria-hidden />;
}
