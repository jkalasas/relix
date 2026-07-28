export type FileKind = "text" | "image" | "pdf" | "binary";

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "avif",
]);

const PDF_EXT = new Set(["pdf"]);

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "rst",
  "log",
  "csv",
  "tsv",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "config",
  "env",
  "properties",
  "xml",
  "html",
  "htm",
  "xhtml",
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  "vue",
  "svelte",
  "py",
  "pyi",
  "rb",
  "php",
  "rs",
  "go",
  "java",
  "kt",
  "kts",
  "swift",
  "c",
  "h",
  "cc",
  "cpp",
  "cxx",
  "hpp",
  "hh",
  "cs",
  "fs",
  "fsx",
  "sql",
  "graphql",
  "gql",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "dockerfile",
  "makefile",
  "cmake",
  "gradle",
  "r",
  "lua",
  "pl",
  "pm",
  "ex",
  "exs",
  "erl",
  "hrl",
  "clj",
  "cljs",
  "edn",
  "scala",
  "sbt",
  "dart",
  "zig",
  "nim",
  "v",
  "sv",
  "vhd",
  "vhdl",
  "asm",
  "s",
  "diff",
  "patch",
  "gitignore",
  "gitattributes",
  "editorconfig",
  "npmrc",
  "nvmrc",
  "prettierrc",
  "eslintrc",
  "babelrc",
  "lock",
  "sum",
  "mod",
  "proto",
  "tf",
  "hcl",
  "nix",
  "vim",
  "service",
  "socket",
  "timer",
  "desktop",
  "plist",
]);

export function extensionOf(name: string): string {
  const base = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
  if (base.startsWith(".") && !base.slice(1).includes(".")) {
    return base.slice(1).toLowerCase();
  }
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return base.toLowerCase();
  return base.slice(dot + 1).toLowerCase();
}

export function kindFromName(name: string): FileKind | null {
  const ext = extensionOf(name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (PDF_EXT.has(ext)) return "pdf";
  if (TEXT_EXT.has(ext)) return "text";
  const lower = name.toLowerCase();
  if (
    lower === "dockerfile" ||
    lower === "makefile" ||
    lower === "gemfile" ||
    lower === "procfile" ||
    lower === "license" ||
    lower === "readme" ||
    lower === "changelog" ||
    lower === "authors" ||
    lower === "copying"
  ) {
    return "text";
  }
  return null;
}

export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let suspicious = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const b = sample[i];
    if (b === 0) return false;
    if (b < 7 || (b > 14 && b < 32 && b !== 27)) suspicious += 1;
  }
  return suspicious / sample.length < 0.1;
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function classifyFile(name: string, bytes: Uint8Array): FileKind {
  const byName = kindFromName(name);
  if (byName === "image" || byName === "pdf") return byName;
  if (byName === "text") return "text";
  if (looksLikeText(bytes)) return "text";
  return "binary";
}

export function mimeForImage(name: string): string {
  const ext = extensionOf(name);
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    case "avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}
