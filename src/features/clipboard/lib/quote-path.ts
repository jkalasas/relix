/**
 * Quote a path as a single POSIX shell word.
 */
export function quoteShellPath(path: string): string {
  return `'${path.replace(/'/g, `'"'"'`)}'`;
}
