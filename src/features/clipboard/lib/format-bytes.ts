const UNITS = ["B", "KB", "MB", "GB"];

/**
 * Format a byte count for transfer status copy.
 */
export function formatTransferBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    Number.isInteger(value) || value >= 100
      ? String(Math.round(value))
      : value.toFixed(1);
  return `${rounded} ${UNITS[unit]}`;
}
