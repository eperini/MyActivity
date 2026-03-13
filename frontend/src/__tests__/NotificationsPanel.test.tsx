import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import NotificationsPanel from "@/components/NotificationsPanel";

// Mock API module
vi.mock("@/lib/api", () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
}));

import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "@/lib/api";

const mockGetNotifications = vi.mocked(getNotifications);
const mockMarkRead = vi.mocked(markNotificationRead);
const mockMarkAllRead = vi.mocked(markAllNotificationsRead);
const mockDelete = vi.mocked(deleteNotification);

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    type: "task_due_soon",
    title: "Task in scadenza",
    body: "Fix bug urgente",
    is_read: false,
    project_id: 1,
    task_id: 10,
    epic_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    type: "project_invitation",
    title: "Invito al progetto",
    body: "Sei stato invitato",
    is_read: true,
    project_id: 2,
    task_id: null,
    epic_id: null,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationsPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <NotificationsPanel open={false} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows loading state", () => {
    mockGetNotifications.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    expect(screen.getByText("Caricamento...")).toBeInTheDocument();
  });

  it("shows empty state when no notifications", async () => {
    mockGetNotifications.mockResolvedValueOnce({ total: 0, unread: 0, notifications: [] });
    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Nessuna notifica")).toBeInTheDocument();
    });
  });

  it("renders notifications list", async () => {
    mockGetNotifications.mockResolvedValueOnce({
      total: 2,
      unread: 1,
      notifications: MOCK_NOTIFICATIONS,
    });

    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Task in scadenza")).toBeInTheDocument();
      expect(screen.getByText("Invito al progetto")).toBeInTheDocument();
      expect(screen.getByText("Fix bug urgente")).toBeInTheDocument();
    });
  });

  it("shows unread badge count", async () => {
    mockGetNotifications.mockResolvedValueOnce({
      total: 2,
      unread: 1,
      notifications: MOCK_NOTIFICATIONS,
    });

    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("shows 'Segna tutte lette' button when unread > 0", async () => {
    mockGetNotifications.mockResolvedValueOnce({
      total: 2,
      unread: 1,
      notifications: MOCK_NOTIFICATIONS,
    });

    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Segna tutte lette")).toBeInTheDocument();
    });
  });

  it("calls onClose when backdrop clicked", async () => {
    mockGetNotifications.mockResolvedValueOnce({ total: 0, unread: 0, notifications: [] });
    const onClose = vi.fn();
    render(<NotificationsPanel open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Nessuna notifica")).toBeInTheDocument();
    });

    // Click backdrop (the bg-black/40 div)
    const backdrop = document.querySelector(".bg-black\\/40");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button clicked", async () => {
    mockGetNotifications.mockResolvedValueOnce({ total: 0, unread: 0, notifications: [] });
    const onClose = vi.fn();
    render(<NotificationsPanel open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Nessuna notifica")).toBeInTheDocument();
    });

    // The X button is near "Notifiche" header
    const buttons = screen.getAllByRole("button");
    const closeButton = buttons.find((b) => b.querySelector("svg"));
    if (closeButton) fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("marks all as read when button clicked", async () => {
    mockGetNotifications.mockResolvedValueOnce({
      total: 2,
      unread: 1,
      notifications: MOCK_NOTIFICATIONS,
    });
    mockMarkAllRead.mockResolvedValueOnce(undefined);

    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Segna tutte lette")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Segna tutte lette"));
    await waitFor(() => {
      expect(mockMarkAllRead).toHaveBeenCalled();
    });
  });

  it("loads on open", async () => {
    mockGetNotifications.mockResolvedValueOnce({ total: 0, unread: 0, notifications: [] });
    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(50, 0);
    });
  });

  it("shows correct emoji for notification type", async () => {
    mockGetNotifications.mockResolvedValueOnce({
      total: 1,
      unread: 1,
      notifications: [MOCK_NOTIFICATIONS[0]],
    });

    render(<NotificationsPanel open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      // task_due_soon should show ⏰
      expect(screen.getByText("⏰")).toBeInTheDocument();
    });
  });
});
