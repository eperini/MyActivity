import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

test.describe("Authentication", () => {
  test("shows login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toHaveText("Zeno");
    await expect(page.locator('text="Accedi al tuo account"')).toBeVisible();
  });

  test("can switch to register mode", async ({ page }) => {
    await page.goto("/login");
    await page.click("text=Non hai un account? Registrati");
    await expect(page.locator('text="Crea un nuovo account"')).toBeVisible();
    await expect(page.locator('input[placeholder="Nome"]')).toBeVisible();
  });

  test("login via API sets cookie and redirects", async ({ page }) => {
    // Use pre-registered user (from global-setup)
    await loginViaUI(page, "e2e_nav@test.com", "e2eTestPass1");
    await expect(page).toHaveURL("/");
    await expect(page.locator("text=Inbox").first()).toBeVisible();
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder="Email"]', "wrong@test.com");
    await page.fill('input[placeholder="Password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Should show error, stay on login
    await expect(page.locator(".text-red-400")).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    // Should redirect to /login
    await page.waitForURL("/login", { timeout: 10000 });
  });
});
