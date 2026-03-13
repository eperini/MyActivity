import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

const OWNER_EMAIL = "e2e_share_own@test.com";
const MEMBER_EMAIL = "e2e_share_mem@test.com";
const PASSWORD = "e2eTestPass1";

test.describe("Sharing & Invitations", () => {
  let projectId: number;

  test("owner creates project and can see members", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL, PASSWORD);
    const apiUrl = "http://localhost:8000/api";

    // Create project
    const projRes = await page.request.post(`${apiUrl}/projects/`, {
      data: { name: `Shared E2E ${Date.now()}` },
    });
    expect(projRes.ok()).toBeTruthy();
    const project = await projRes.json();
    projectId = project.id;

    // Get members
    const membersRes = await page.request.get(`${apiUrl}/projects/${projectId}/members`);
    expect(membersRes.ok()).toBeTruthy();
    const members = await membersRes.json();
    expect(members).toHaveLength(1); // owner only
    expect(members[0].role).toBe("admin");
  });

  test("owner can send invitation to member", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL, PASSWORD);
    const apiUrl = "http://localhost:8000/api";

    // Ensure project exists
    if (!projectId) {
      const projRes = await page.request.post(`${apiUrl}/projects/`, {
        data: { name: `Shared E2E ${Date.now()}` },
      });
      projectId = (await projRes.json()).id;
    }

    // Send invitation
    const invRes = await page.request.post(`${apiUrl}/projects/${projectId}/invitations/`, {
      data: { email: MEMBER_EMAIL, role: "user" },
    });
    expect(invRes.ok()).toBeTruthy();
    const inv = await invRes.json();
    expect(inv.email).toBe(MEMBER_EMAIL);
    expect(inv.status).toBe("pending");
  });

  test("member can see pending invitations", async ({ page }) => {
    await loginViaUI(page, MEMBER_EMAIL, PASSWORD);
    const apiUrl = "http://localhost:8000/api";

    const pendingRes = await page.request.get(`${apiUrl}/invitations/pending/me`);
    expect(pendingRes.ok()).toBeTruthy();
    const pending = await pendingRes.json();
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });

  test("non-member cannot access the project", async ({ page }) => {
    // Use member before they're accepted
    await loginViaUI(page, MEMBER_EMAIL, PASSWORD);
    const apiUrl = "http://localhost:8000/api";

    if (projectId) {
      const res = await page.request.get(`${apiUrl}/projects/${projectId}`);
      // Should be 403 since member hasn't accepted yet
      expect(res.status()).toBe(403);
    }
  });

  test("owner can add member directly", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL, PASSWORD);
    const apiUrl = "http://localhost:8000/api";

    // Create a new project for this test
    const projRes = await page.request.post(`${apiUrl}/projects/`, {
      data: { name: `Direct Add ${Date.now()}` },
    });
    const project = await projRes.json();

    // Add member directly
    const addRes = await page.request.post(`${apiUrl}/projects/${project.id}/members`, {
      data: { email: MEMBER_EMAIL, role: "user" },
    });
    expect(addRes.ok()).toBeTruthy();

    // Verify member list
    const membersRes = await page.request.get(`${apiUrl}/projects/${project.id}/members`);
    const members = await membersRes.json();
    expect(members).toHaveLength(2);

    // Member can now access project
    await page.context().clearCookies();
    await loginViaUI(page, MEMBER_EMAIL, PASSWORD);
    const accessRes = await page.request.get(`${apiUrl}/projects/${project.id}`);
    expect(accessRes.ok()).toBeTruthy();
  });
});
