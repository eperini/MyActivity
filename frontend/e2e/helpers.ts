import { Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// Load pre-authenticated tokens from global setup
let tokenCache: Record<string, string> = {};
const tokensPath = path.join(__dirname, ".auth-tokens.json");
if (fs.existsSync(tokensPath)) {
  tokenCache = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
}

/**
 * Log in by setting the pre-obtained auth cookie on the browser context.
 * Tokens are obtained once in global-setup.ts to avoid rate limiting.
 */
export async function loginViaUI(page: Page, email: string, password: string) {
  const token = tokenCache[email];
  if (!token) {
    throw new Error(
      `No pre-authenticated token for ${email}. Ensure global-setup.ts registered this user.`
    );
  }

  // Set the auth cookie on the browser context
  await page.context().addCookies([
    {
      name: "access_token",
      value: token,
      domain: "localhost",
      path: "/",
    },
  ]);

  // Navigate to the main page
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}
