import { expect, test } from "@playwright/test";
import { tauriMockInitScript } from "./helpers/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockInitScript());
});

test("boots to hosts page empty state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Loading hosts…")).toHaveCount(0, {
    timeout: 15_000,
  });

  await expect(page.getByText("Relix", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No hosts yet")).toBeVisible();
});
