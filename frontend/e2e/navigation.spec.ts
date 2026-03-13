import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

const EMAIL = "e2e_nav@test.com";
const PASSWORD = "e2eTestPass1";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, EMAIL, PASSWORD);
  });

  test("sidebar shows main navigation items", async ({ page }) => {
    await expect(page.locator("text=Inbox").first()).toBeVisible();
    await expect(page.locator("text=Abitudini").first()).toBeVisible();
    await expect(page.locator("text=Statistiche").first()).toBeVisible();
    await expect(page.locator("text=Notifiche").first()).toBeVisible();
    await expect(page.locator("text=Impostazioni").first()).toBeVisible();
  });

  test("can navigate to different views", async ({ page }) => {
    await page.locator("text=Inbox").first().click();
    await page.waitForTimeout(500);

    await page.locator("text=Abitudini").first().click();
    await page.waitForTimeout(500);

    await page.locator("text=Statistiche").first().click();
    await page.waitForTimeout(500);
  });

  test("can navigate to Notifiche", async ({ page }) => {
    await page.locator("text=Notifiche").first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("text=Notifiche").first()).toBeVisible();
  });
});
