import { expect, test } from "@playwright/test";
import { bootApp } from "./helpers/app";

test("boots to hosts page empty state", async ({ page }) => {
  await bootApp(page);

  await expect(page.getByText("Relix", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No hosts yet")).toBeVisible();
});
