import { vi } from "vitest";

/** Build a vi.fn invoke stub for use inside top-level vi.mock factories. */
export function createInvokeMock(
  handlers: Record<string, (args?: unknown) => unknown | Promise<unknown>> = {},
) {
  return vi.fn(async (cmd: string, args?: unknown) => {
    const handler = handlers[cmd];
    if (handler) return handler(args);
    throw new Error(`unmocked invoke: ${cmd}`);
  });
}
