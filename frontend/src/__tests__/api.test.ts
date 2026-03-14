import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Must import after mock setup
import {
  login,
  register,
  logout,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getAreas,
  createArea,
  getProjects,
  createProject,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getProjectMembers,
  sendProjectInvitation,
  getInvitationPreview,
  acceptInvitation,
  declineInvitation,
} from "@/lib/api";

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  // Prevent actual redirects
  delete (window as Record<string, unknown>).location;
  (window as Record<string, unknown>).location = { href: "", pathname: "/" } as unknown as Location;
});

describe("Auth API", () => {
  it("login sends correct request", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ access_token: "tok123" }));
    const result = await login("test@test.com", "pass123");
    expect(result.access_token).toBe("tok123");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/auth/login");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ email: "test@test.com", password: "pass123" });
    expect(opts.credentials).toBe("include");
  });

  it("register sends correct fields", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ access_token: "tok456" }));
    const result = await register("new@test.com", "pass123", "New User");
    expect(result.access_token).toBe("tok456");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ email: "new@test.com", password: "pass123", display_name: "New User" });
  });

  it("logout sends POST", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ detail: "ok" }));
    await logout();
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("401 redirects to login", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    await expect(getTasks()).rejects.toThrow("Non autorizzato");
    expect(window.location.href).toBe("/login");
  });

  it("401 does NOT redirect when already on /login", async () => {
    (window.location as unknown as Record<string, string>).pathname = "/login";
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    await expect(getTasks()).rejects.toThrow("Non autorizzato");
    expect(window.location.href).not.toBe("/login");
  });

  it("non-401 error throws with detail message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: "Campo obbligatorio" }),
    });
    await expect(createTask({ title: "" })).rejects.toThrow("Campo obbligatorio");
  });
});

describe("Tasks API", () => {
  it("getTasks with params builds query string", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await getTasks({ project_id: 5, status: "todo" });
    expect(mockFetch.mock.calls[0][0]).toContain("project_id=5");
    expect(mockFetch.mock.calls[0][0]).toContain("status=todo");
  });

  it("createTask sends POST", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, title: "Test" }));
    await createTask({ title: "Test", project_id: 1 });
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("updateTask sends PATCH", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, title: "Updated" }));
    await updateTask(1, { title: "Updated" });
    expect(mockFetch.mock.calls[0][0]).toContain("/tasks/1");
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it("deleteTask sends DELETE", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ detail: "ok" }));
    await deleteTask(1);
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("Areas API", () => {
  it("getAreas fetches correctly", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([{ id: 1, name: "Work" }]));
    const areas = await getAreas();
    expect(areas).toHaveLength(1);
  });

  it("createArea sends correct data", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, name: "Area" }));
    await createArea({ name: "Area", color: "#3B82F6" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ name: "Area", color: "#3B82F6" });
  });
});

describe("Projects API", () => {
  it("getProjects with filters", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await getProjects({ area_id: 1, status: "active" });
    expect(mockFetch.mock.calls[0][0]).toContain("area_id=1");
    expect(mockFetch.mock.calls[0][0]).toContain("status=active");
  });

  it("createProject sends POST", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, name: "P" }));
    await createProject({ name: "P" });
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });
});

describe("Notifications API", () => {
  it("getNotifications with pagination", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ total: 5, unread: 2, notifications: [] })
    );
    const result = await getNotifications(10, 5);
    expect(mockFetch.mock.calls[0][0]).toContain("limit=10");
    expect(mockFetch.mock.calls[0][0]).toContain("offset=5");
    expect(result.total).toBe(5);
  });

  it("getUnreadNotificationCount", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ unread: 3 }));
    const result = await getUnreadNotificationCount();
    expect(result.unread).toBe(3);
  });

  it("markNotificationRead sends PATCH", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(undefined, 204));
    await markNotificationRead(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/notifications/1/read");
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it("markAllNotificationsRead", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(undefined, 204));
    await markAllNotificationsRead();
    expect(mockFetch.mock.calls[0][0]).toContain("/notifications/read-all");
  });

  it("deleteNotification sends DELETE", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(undefined, 204));
    await deleteNotification(5);
    expect(mockFetch.mock.calls[0][0]).toContain("/notifications/5");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("Invitations API", () => {
  it("sendProjectInvitation", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, email: "test@test.com" }));
    await sendProjectInvitation(5, { email: "test@test.com", role: "user" });
    expect(mockFetch.mock.calls[0][0]).toContain("/projects/5/invitations/");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("getInvitationPreview (no auth needed)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1, status: "pending" }));
    const inv = await getInvitationPreview("abc123");
    expect(mockFetch.mock.calls[0][0]).toContain("/invitations/abc123");
    expect(inv.status).toBe("pending");
  });

  it("acceptInvitation with new area", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: "accepted", project_id: 3 }));
    const result = await acceptInvitation("tok", { new_area_name: "New Area" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ new_area_name: "New Area" });
    expect(result.project_id).toBe(3);
  });

  it("acceptInvitation with existing area", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: "accepted", project_id: 3 }));
    await acceptInvitation("tok", { area_id: 7 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ area_id: 7 });
  });

  it("declineInvitation sends POST", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: "declined" }));
    await declineInvitation("tok");
    expect(mockFetch.mock.calls[0][0]).toContain("/invitations/tok/decline");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });
});

describe("Members API", () => {
  it("getProjectMembers", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse([{ id: 1, user_id: 1, role: "admin" }]));
    const members = await getProjectMembers(5);
    expect(mockFetch.mock.calls[0][0]).toContain("/projects/5/members");
    expect(members).toHaveLength(1);
  });
});
