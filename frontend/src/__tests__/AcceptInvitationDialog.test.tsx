import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AcceptInvitationDialog from "@/components/AcceptInvitationDialog";
import { ToastProvider } from "@/components/Toast";

// Mock API
vi.mock("@/lib/api", () => ({
  getInvitationPreview: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  getAreas: vi.fn(),
}));

import {
  getInvitationPreview,
  acceptInvitation,
  declineInvitation,
  getAreas,
} from "@/lib/api";

const mockGetPreview = vi.mocked(getInvitationPreview);
const mockAccept = vi.mocked(acceptInvitation);
const mockDecline = vi.mocked(declineInvitation);
const mockGetAreas = vi.mocked(getAreas);

const MOCK_INVITATION = {
  id: 1,
  project_id: 5,
  email: "user@test.com",
  role: "user",
  status: "pending",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  invited_by_name: "Admin User",
  project_name: "Shared Project",
  created_at: new Date().toISOString(),
};

const MOCK_AREAS = [
  { id: 1, name: "Work", color: null, icon: null, position: 0, project_count: 2 },
  { id: 2, name: "Personal", color: null, icon: null, position: 1, project_count: 1 },
];

function renderDialog(onAccepted = vi.fn(), onDeclined = vi.fn()) {
  return render(
    <ToastProvider>
      <AcceptInvitationDialog
        token="test-token"
        onAccepted={onAccepted}
        onDeclined={onDeclined}
      />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AcceptInvitationDialog", () => {
  it("shows loading state initially", () => {
    mockGetPreview.mockReturnValue(new Promise(() => {}));
    mockGetAreas.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getByText("Caricamento...")).toBeInTheDocument();
  });

  it("shows invitation details after loading", async () => {
    mockGetPreview.mockResolvedValueOnce(MOCK_INVITATION as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
      expect(screen.getByText(/Shared Project/)).toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();
    });
  });

  it("shows 'not found' when invitation fails to load", async () => {
    mockGetPreview.mockRejectedValueOnce(new Error("Not found"));
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("Invito non trovato o scaduto.")).toBeInTheDocument();
    });
  });

  it("shows area selection options", async () => {
    mockGetPreview.mockResolvedValueOnce(MOCK_INVITATION as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("Work")).toBeInTheDocument();
      expect(screen.getByText("Personal")).toBeInTheDocument();
      expect(screen.getByText("Crea nuova area")).toBeInTheDocument();
    });
  });

  it("shows already handled state for non-pending invitation", async () => {
    mockGetPreview.mockResolvedValueOnce({ ...MOCK_INVITATION, status: "accepted" } as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(/già.*accettato/)).toBeInTheDocument();
    });
  });

  it("shows expired state", async () => {
    mockGetPreview.mockResolvedValueOnce({ ...MOCK_INVITATION, status: "expired" } as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(/scaduto/)).toBeInTheDocument();
    });
  });

  it("calls acceptInvitation with selected area", async () => {
    mockGetPreview.mockResolvedValueOnce(MOCK_INVITATION as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);
    mockAccept.mockResolvedValueOnce({ status: "accepted", project_id: 5 });

    const onAccepted = vi.fn();
    renderDialog(onAccepted);

    await waitFor(() => {
      expect(screen.getByText("Accetta")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Accetta"));
    await waitFor(() => {
      expect(mockAccept).toHaveBeenCalledWith("test-token", { area_id: 1 });
      expect(onAccepted).toHaveBeenCalledWith(5);
    });
  });

  it("shows 'create new area' input when selected", async () => {
    mockGetPreview.mockResolvedValueOnce(MOCK_INVITATION as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("Crea nuova area")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Crea nuova area"));
    expect(screen.getByPlaceholderText("Nome nuova area...")).toBeInTheDocument();
  });

  it("decline requires confirmation", async () => {
    mockGetPreview.mockResolvedValueOnce(MOCK_INVITATION as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("Rifiuta")).toBeInTheDocument();
    });

    // First click shows confirmation
    fireEvent.click(screen.getByText("Rifiuta"));
    expect(screen.getByText("Sei sicuro?")).toBeInTheDocument();
    expect(screen.getByText("Conferma rifiuto")).toBeInTheDocument();
  });

  it("decline can be cancelled", async () => {
    mockGetPreview.mockResolvedValueOnce(MOCK_INVITATION as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("Rifiuta")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Rifiuta"));
    fireEvent.click(screen.getByText("Annulla"));
    // Should be back to "Rifiuta" button
    expect(screen.getByText("Rifiuta")).toBeInTheDocument();
  });

  it("confirmed decline calls API and onDeclined", async () => {
    mockGetPreview.mockResolvedValueOnce(MOCK_INVITATION as never);
    mockGetAreas.mockResolvedValueOnce(MOCK_AREAS as never);
    mockDecline.mockResolvedValueOnce({ status: "declined" });

    const onDeclined = vi.fn();
    renderDialog(vi.fn(), onDeclined);

    await waitFor(() => {
      expect(screen.getByText("Rifiuta")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Rifiuta"));
    fireEvent.click(screen.getByText("Conferma rifiuto"));

    await waitFor(() => {
      expect(mockDecline).toHaveBeenCalledWith("test-token");
      expect(onDeclined).toHaveBeenCalled();
    });
  });
});
