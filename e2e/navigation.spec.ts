import { expect, test } from "@playwright/test";
import {
  addHost,
  bootApp,
  defaultHost,
  goBack,
  openAdhoc,
  openPorts,
} from "./helpers/app";

test.beforeEach(async ({ page }) => {
  await bootApp(page);
  await addHost(page, defaultHost);
});

test("adhoc workspace shows idle terminal", async ({ page }) => {
  await openAdhoc(page);

  await expect(page.getByText("Terminal is idle")).toBeVisible();
  await expect(
    page.getByText(`Connect to ${defaultHost.name} to open a shell session.`),
  ).toBeVisible();
});

test("ports tab shows empty state offline", async ({ page }) => {
  await openAdhoc(page);
  await openPorts(page);

  await expect(page.getByRole("button", { name: "New tunnel" }).first()).toBeVisible();
});

test("add tunnel offline lists idle row", async ({ page }) => {
  await openAdhoc(page);
  await openPorts(page);
  await page.getByRole("button", { name: "New tunnel" }).first().click();

  await expect(page.getByRole("heading", { name: "New tunnel" })).toBeVisible();
  await page.getByRole("button", { name: "Add tunnel" }).click();

  const ports = page.getByRole("list", { name: "Ports" });
  await expect(ports.getByText("127.0.0.1:8080").first()).toBeVisible();
  await expect(ports.getByText("→ 127.0.0.1:8080")).toBeVisible();
  await expect(ports.getByText("idle", { exact: true })).toBeVisible();
});

test("back stack: workspace → projects → hosts", async ({ page }) => {
  await openAdhoc(page);
  await expect(page.getByText("Terminal is idle")).toBeVisible();

  await goBack(page);
  await expect(page.getByText("Ad hoc", { exact: true })).toBeVisible();
  await expect(page.getByText("No projects yet")).toBeVisible();

  await goBack(page);
  const list = page.getByRole("list", { name: "Saved hosts" });
  await expect(list.getByText(defaultHost.name, { exact: true })).toBeVisible();
});
