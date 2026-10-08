/** Remote staging directory for pasted files. */
export const CLIPBOARD_DIR = "/tmp/relix-clipboard";

/** Largest single file accepted for staging (matches backend cap). */
export const MAX_STAGED_BYTES = 32 * 1024 * 1024;

/** Upload chunk size per host_fs_write_chunk call. */
export const UPLOAD_CHUNK_BYTES = 512 * 1024;

/**
 * Extract the final segment of a filesystem path.
 */
export function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const rest = normalized.split("/").filter((part) => part.length > 0);
  return rest[rest.length - 1] ?? path;
}

/**
 * Keep only a safe extension: lowercase alphanumerics, at most 8 chars.
 * Returns "" when the name has no usable extension.
 */
export function sanitizeExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  const ext = name.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return "";
  return ext;
}

/**
 * Build an unguessable staged filename preserving the original file type.
 */
export function stagedFileName(originalName: string): string {
  const id = crypto.randomUUID();
  const ext = sanitizeExtension(originalName);
  return ext ? `${id}.${ext}` : id;
}

/**
 * Build the full remote path a pasted file is staged at.
 */
export function stagedRemotePath(originalName: string): string {
  return `${CLIPBOARD_DIR}/${stagedFileName(originalName)}`;
}
