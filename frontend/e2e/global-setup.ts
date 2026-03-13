/**
 * Global setup: register all E2E test users and obtain auth tokens.
 * Tokens are saved to a file for tests to reuse, avoiding rate limiting.
 */

import * as fs from "fs";
import * as path from "path";

const API_URL = "http://localhost:8000/api";

async function registerUser(email: string, password: string, name: string) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: name }),
  });
  // 400 = already registered (ok for reruns)
  if (!res.ok && res.status !== 400 && res.status !== 429) {
    throw new Error(`Failed to register ${email}: ${res.status}`);
  }
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 15000));
    const retry = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, display_name: name }),
    });
    if (!retry.ok && retry.status !== 400) {
      throw new Error(`Failed to register ${email} on retry: ${retry.status}`);
    }
  }
}

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 429) {
    // Wait for rate limit reset and retry
    await new Promise((r) => setTimeout(r, 61000));
    const retry = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!retry.ok) throw new Error(`Login failed for ${email}: ${retry.status}`);
    return (await retry.json()).access_token;
  }
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  return (await res.json()).access_token;
}

export default async function globalSetup() {
  const password = "e2eTestPass1";

  const users = [
    { email: "e2e_nav@test.com", name: "Nav User" },
    { email: "e2e_proj@test.com", name: "Proj User" },
    { email: "e2e_task@test.com", name: "Task User" },
    { email: "e2e_share_own@test.com", name: "Share Owner" },
    { email: "e2e_share_mem@test.com", name: "Share Member" },
  ];

  // Register users sequentially with delays to avoid rate limits
  for (const user of users) {
    await registerUser(user.email, password, user.name);
    await new Promise((r) => setTimeout(r, 500));
  }

  // Wait a bit to ensure register rate limit window passes
  await new Promise((r) => setTimeout(r, 2000));

  // Login each user and collect tokens
  const tokens: Record<string, string> = {};
  for (const user of users) {
    tokens[user.email] = await loginUser(user.email, password);
    await new Promise((r) => setTimeout(r, 200));
  }

  // Save tokens to file for test consumption
  const tokensPath = path.join(__dirname, ".auth-tokens.json");
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
}
