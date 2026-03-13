import { test, expect } from "@playwright/test";
import { loginViaUI } from "./helpers";

const EMAIL = "e2e_task@test.com";
const PASSWORD = "e2eTestPass1";

test.describe("Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, EMAIL, PASSWORD);
  });

  test("can view today view", async ({ page }) => {
    // Page should load without errors
    await expect(page).toHaveURL("/");
    await expect(page.locator("text=Inbox").first()).toBeVisible();
  });

  test("can navigate to inbox", async ({ page }) => {
    await page.locator("text=Inbox").first().click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL("/");
  });

  test("tasks CRUD works via API", async ({ page }) => {
    const apiUrl = "http://localhost:8000/api";

    // Create a list
    const listRes = await page.request.post(`${apiUrl}/lists/`, {
      data: { name: `E2E List ${Date.now()}` },
    });
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();

    // Create task
    const taskRes = await page.request.post(`${apiUrl}/tasks/`, {
      data: { title: `E2E Task ${Date.now()}`, list_id: list.id },
    });
    expect(taskRes.ok()).toBeTruthy();
    const task = await taskRes.json();
    expect(task.status).toBe("todo");

    // Update task
    const updateRes = await page.request.patch(`${apiUrl}/tasks/${task.id}`, {
      data: { status: "done" },
    });
    expect(updateRes.ok()).toBeTruthy();
    expect((await updateRes.json()).status).toBe("done");

    // Delete task
    const deleteRes = await page.request.delete(`${apiUrl}/tasks/${task.id}`);
    expect(deleteRes.ok()).toBeTruthy();
  });

  test("time log CRUD works via API", async ({ page }) => {
    const apiUrl = "http://localhost:8000/api";

    // Setup: list + task
    const list = await (await page.request.post(`${apiUrl}/lists/`, {
      data: { name: `TL List ${Date.now()}` },
    })).json();
    const task = await (await page.request.post(`${apiUrl}/tasks/`, {
      data: { title: "Time Task", list_id: list.id },
    })).json();

    // Create time log
    const logRes = await page.request.post(`${apiUrl}/tasks/${task.id}/time`, {
      data: { minutes: 60, note: "E2E test" },
    });
    expect(logRes.ok()).toBeTruthy();
    const log = await logRes.json();
    expect(log.minutes).toBe(60);

    // Get weekly view
    const weekRes = await page.request.get(`${apiUrl}/time/week`);
    expect(weekRes.ok()).toBeTruthy();

    // Delete log
    const delRes = await page.request.delete(`${apiUrl}/tasks/${task.id}/time/${log.id}`);
    expect(delRes.ok()).toBeTruthy();
  });
});
