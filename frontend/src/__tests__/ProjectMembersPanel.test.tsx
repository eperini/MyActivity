import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProjectMembersPanel from "@/components/ProjectMembersPanel";
import { ToastProvider } from "@/components/Toast";

vi.mock("@/lib/api", () => ({
  getProjectMembers: vi.fn(),
  removeProjectMember: vi.fn(),
  getProjectInvitations: vi.fn(),
  sendProjectInvitation: vi.fn(),
  cancelProjectInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
}));

import {
  getProjectMembers,
  removeProjectMember,
  getProjectInvitations,
  sendProjectInvitation,
  cancelProjectInvitation,
  updateMemberRole,
} from "@/lib/api";

const mockGetMembers = vi.mocked(getProjectMembers);
const mockRemoveMember = vi.mocked(removeProjectMember);
const mockGetInvitations = vi.mocked(getProjectInvitations);
const mockSendInvitation = vi.mocked(sendProjectInvitation);
const mockCancelInvitation = vi.mocked(cancelProjectInvitation);

const MOCK_MEMBERS = [
  { id: 1, user_id: 10, email: "owner@test.com", display_name: "Owner User", role: "admin" },
  { id: 2, user_id: 20, email: "member@test.com", display_name: "Member User", role: "user" },
];

const MOCK_INVITATIONS = [
  {
    id: 100,
    project_id: 1,
    email: "invited@test.com",
    role: "user",
    status: "pending",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    invited_by_name: "Owner",
    project_name: "P",
    created_at: new Date().toISOString(),
  },
];

function renderPanel(props = {}) {
  const defaults = {
    projectId: 1,
    currentUserRole: "admin",
    ownerId: 10,
    currentUserId: 10,
  };
  return render(
    <ToastProvider>
      <ProjectMembersPanel {...defaults} {...props} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMembers.mockResolvedValue(MOCK_MEMBERS as never);
  mockGetInvitations.mockResolvedValue(MOCK_INVITATIONS as never);
});

describe("ProjectMembersPanel", () => {
  it("shows loading state", () => {
    mockGetMembers.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText("Caricamento membri...")).toBeInTheDocument();
  });

  it("renders member list", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Owner User")).toBeInTheDocument();
      expect(screen.getByText("Member User")).toBeInTheDocument();
    });
  });

  it("shows member count in header", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Membri del progetto \(2\)/)).toBeInTheDocument();
    });
  });

  it("shows member emails", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("owner@test.com")).toBeInTheDocument();
      expect(screen.getByText("member@test.com")).toBeInTheDocument();
    });
  });

  it("shows invite button for admin", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Invita")).toBeInTheDocument();
    });
  });

  it("hides invite button for non-admin", async () => {
    renderPanel({ currentUserRole: "user", currentUserId: 20, ownerId: 10 });
    await waitFor(() => {
      expect(screen.queryByText("Invita")).not.toBeInTheDocument();
    });
  });

  it("shows invite form when Invita clicked", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Invita")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Invita"));
    expect(screen.getByPlaceholderText("Email utente...")).toBeInTheDocument();
    expect(screen.getByText("Invia invito")).toBeInTheDocument();
  });

  it("sends invitation on submit", async () => {
    mockSendInvitation.mockResolvedValueOnce({} as never);
    // After reload
    mockGetMembers.mockResolvedValue(MOCK_MEMBERS as never);
    mockGetInvitations.mockResolvedValue([] as never);

    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Invita")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Invita"));

    const emailInput = screen.getByPlaceholderText("Email utente...");
    fireEvent.change(emailInput, { target: { value: "new@test.com" } });
    fireEvent.click(screen.getByText("Invia invito"));

    await waitFor(() => {
      expect(mockSendInvitation).toHaveBeenCalledWith(1, {
        email: "new@test.com",
        role: "user",
      });
    });
  });

  it("shows pending invitations for admin", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Inviti pendenti")).toBeInTheDocument();
      expect(screen.getByText("invited@test.com")).toBeInTheDocument();
    });
  });

  it("hides pending invitations for non-admin", async () => {
    mockGetInvitations.mockResolvedValue([] as never);
    renderPanel({ currentUserRole: "user", currentUserId: 20, ownerId: 10 });
    await waitFor(() => {
      expect(screen.getByText("Member User")).toBeInTheDocument();
    });
    expect(screen.queryByText("Inviti pendenti")).not.toBeInTheDocument();
  });

  it("shows role dropdown for admin on non-owner members", async () => {
    renderPanel();
    await waitFor(() => {
      // Should have a select for the non-owner member
      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows initials for members", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("OU")).toBeInTheDocument(); // Owner User
      expect(screen.getByText("MU")).toBeInTheDocument(); // Member User
    });
  });
});
