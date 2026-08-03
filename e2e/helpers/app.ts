import { expect, type Page } from "@playwright/test";
import { tauriMockInitScript } from "./tauri-mock";

export type HostFormFields = {
  name: string;
  user: string;
  hostname: string;
  port?: number;
  password: string;
};

export const defaultHost: HostFormFields = {
  name: "bastion",
  user: "deploy",
  hostname: "bastion.example.com",
  port: 22,
  password: "secret",
};

export async function installTauriMock(page: Page): Promise<void> {
  await page.addInitScript(tauriMockInitScript());
}

export async function bootApp(page: Page): Promise<void> {
  await installTauriMock(page);
  await page.goto("/");
  await expect(page.getByText("Loading hosts…")).toHaveCount(0, {
    timeout: 15_000,
  });
}

export async function openAddHostForm(page: Page): Promise<void> {
  // Prefer the labeled empty-state CTA (text) over the header icon button (aria-label only).
  const textCta = page.locator("button", { hasText: /^Add host$/ });
  if (await textCta.count()) {
    await textCta.first().click();
  } else {
    await page.getByRole("button", { name: "Add host" }).first().click();
  }
  await expect(page.getByRole("heading", { name: "Add host" })).toBeVisible();
}

export async function fillHostForm(
  page: Page,
  fields: HostFormFields,
): Promise<void> {
  await page.getByLabel("Name", { exact: true }).fill(fields.name);
  await page.getByLabel("User", { exact: true }).fill(fields.user);
  await page.getByLabel("Hostname", { exact: true }).fill(fields.hostname);
  await page.getByLabel("Port", { exact: true }).fill(String(fields.port ?? 22));
  await page.getByLabel("Password", { exact: true }).fill(fields.password);
}

export async function submitAddHost(page: Page): Promise<void> {
  await page.locator("form").getByRole("button", { name: "Add host" }).click();
}

export async function addHost(
  page: Page,
  fields: HostFormFields = defaultHost,
): Promise<void> {
  await openAddHostForm(page);
  await fillHostForm(page, fields);
  await submitAddHost(page);
  await expect(page.getByText(fields.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ad hoc", { exact: true })).toBeVisible();
}

export async function openAdhoc(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Ad hoc/ }).click();
  await expect(page.getByText("Terminal is idle")).toBeVisible();
}

/** Ports tab chrome is hidden while disconnected; shortcut 3 still opens the panel. */
export async function openPorts(page: Page): Promise<void> {
  await page.keyboard.press("3");
  await expect(page.getByText("No ports yet")).toBeVisible({
    timeout: 5_000,
  });
}

/** Desktop titlebar chrome has no back button; Esc walks the page stack. */
export async function goBack(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
}

export function hostTarget(fields: HostFormFields): string {
  return `${fields.user}@${fields.hostname}:${fields.port ?? 22}`;
}
