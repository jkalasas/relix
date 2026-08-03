import { expect, test } from "@playwright/test";
import {
  addHost,
  bootApp,
  defaultHost,
  fillHostForm,
  hostTarget,
  openAddHostForm,
  submitAddHost,
} from "./helpers/app";

test.beforeEach(async ({ page }) => {
  await bootApp(page);
});

test("cancel add host returns to empty hosts", async ({ page }) => {
  await openAddHostForm(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("No hosts yet")).toBeVisible();
});

test("host form validation shows required error", async ({ page }) => {
  await openAddHostForm(page);
  await submitAddHost(page);
  await expect(page.getByRole("alert")).toHaveText("Name is required");
});

test("add host lands on projects page", async ({ page }) => {
  await addHost(page, defaultHost);

  await expect(page.getByText(defaultHost.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(hostTarget(defaultHost))).toBeVisible();
  await expect(page.getByText("Ad hoc", { exact: true })).toBeVisible();
  await expect(page.getByText("No projects yet")).toBeVisible();
});

test("saved host appears in hosts list", async ({ page }) => {
  await addHost(page, defaultHost);
  await page.getByRole("button", { name: "Back to hosts" }).click();

  const list = page.getByRole("list", { name: "Saved hosts" });
  await expect(list.getByText(defaultHost.name, { exact: true })).toBeVisible();
  await expect(list.getByText(hostTarget(defaultHost))).toBeVisible();
});

test("edit host updates name", async ({ page }) => {
  await addHost(page, defaultHost);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit host" })).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("bastion-prod");
  await page.getByRole("button", { name: "Save host" }).click();

  await expect(page.getByText("bastion-prod", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(hostTarget(defaultHost))).toBeVisible();
});

test("delete host returns to empty hosts", async ({ page }) => {
  await addHost(page, defaultHost);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();

  await expect(page.getByText("No hosts yet")).toBeVisible();
});

test("add host with custom port", async ({ page }) => {
  await openAddHostForm(page);
  await fillHostForm(page, {
    name: "edge",
    user: "ops",
    hostname: "edge.example.com",
    port: 2222,
    password: "pw",
  });
  await submitAddHost(page);

  await expect(page.getByText("edge", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("ops@edge.example.com:2222")).toBeVisible();
});
