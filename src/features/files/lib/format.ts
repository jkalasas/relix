export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function pathSeparator(path: string): "/" | "\\" {
  if (path.includes("\\") || /^[A-Za-z]:/.test(path)) return "\\";
  return "/";
}

function stripTrailingSeparators(path: string): string {
  let end = path.length;
  while (end > 1 && (path[end - 1] === "/" || path[end - 1] === "\\")) {
    end -= 1;
  }
  return path.slice(0, end);
}

function lastSeparatorIndex(path: string): number {
  return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
}

function isRootPath(path: string): boolean {
  if (!path || path === ".") return true;
  if (path === "/" || path === "\\") return true;
  return /^[A-Za-z]:[\\/]?$/.test(path);
}

export function parentPath(path: string): string | null {
  if (isRootPath(path)) return null;
  const trimmed = stripTrailingSeparators(path);
  if (isRootPath(trimmed)) return null;
  const index = lastSeparatorIndex(trimmed);
  if (index < 0) return null;
  if (index === 0) return trimmed[0] === "\\" ? "\\" : "/";
  const parent = trimmed.slice(0, index);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent || "/";
}

export function joinFsPath(dir: string, name: string): string {
  if (!dir || dir === ".") return name;
  const sep = pathSeparator(dir);
  if (dir.endsWith("/") || dir.endsWith("\\")) return `${dir}${name}`;
  return `${dir}${sep}${name}`;
}

export function basename(path: string): string {
  const trimmed = stripTrailingSeparators(path);
  const index = lastSeparatorIndex(trimmed);
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}
