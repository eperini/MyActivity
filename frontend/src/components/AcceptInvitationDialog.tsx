"use client";

import { useState, useEffect } from "react";
import { Mail, Plus } from "lucide-react";
import type { ProjectInvitation, Area } from "@/types";
import { getInvitationPreview, acceptInvitation, declineInvitation, getAreas } from "@/lib/api";
import { useToast } from "./Toast";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  super_user: "Super User",
  user: "User",
};

interface Props {
  token: string;
  onAccepted: (projectId: number) => void;
  onDeclined: () => void;
}

export default function AcceptInvitationDialog({ token, onAccepted, onDeclined }: Props) {
  const { showToast } = useToast();
  const [invitation, setInvitation] = useState<ProjectInvitation | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  useEffect(() => {
    loadData();
  }, [token]);

  async function loadData() {
    try {
      const [inv, areaList] = await Promise.all([
        getInvitationPreview(token),
        getAreas(),
      ]);
      setInvitation(inv);
      setAreas(areaList);
      if (areaList.length > 0) {
        setSelectedAreaId(areaList[0].id);
      }
    } catch {
      showToast("Invito non valido o scaduto");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!createNew && !selectedAreaId) return;
    if (createNew && !newAreaName.trim()) return;
    setSubmitting(true);
    try {
      const result = await acceptInvitation(token, createNew
        ? { new_area_name: newAreaName.trim() }
        : { area_id: selectedAreaId! }
      );
      showToast("Invito accettato!", "success");
      onAccepted(result.project_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore";
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    setSubmitting(true);
    try {
      await declineInvitation(token);
      showToast("Invito rifiutato");
      onDeclined();
    } catch {
      showToast("Errore");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-zinc-900 rounded-xl p-6 text-zinc-400 text-sm">Caricamento...</div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-zinc-900 rounded-xl p-6 text-center">
          <p className="text-zinc-400 text-sm">Invito non trovato o scaduto.</p>
          <button
            onClick={onDeclined}
            className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-zinc-900 rounded-xl p-6 text-center">
          <p className="text-zinc-400 text-sm">
            Questo invito è stato già {invitation.status === "accepted" ? "accettato" : invitation.status === "expired" ? "scaduto" : "gestito"}.
          </p>
          <button
            onClick={onDeclined}
            className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Mail size={18} className="text-blue-400" />
          <h2 className="text-base font-medium text-white">Invito al progetto</h2>
        </div>

        {/* Info */}
        <div className="bg-zinc-800/50 rounded-lg p-4 mb-5">
          <p className="text-sm text-zinc-300">
            <span className="font-medium">{invitation.invited_by_name}</span> ti ha invitato al progetto
          </p>
          <p className="text-base font-medium text-white mt-1">
            &ldquo;{invitation.project_name}&rdquo;
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Ruolo: <span className="text-zinc-300">{ROLE_LABELS[invitation.role] || invitation.role}</span>
          </p>
        </div>

        {/* Area selection */}
        <div className="mb-5">
          <p className="text-sm text-zinc-300 mb-3">
            In quale area vuoi organizzare questo progetto?
          </p>
          <div className="space-y-1.5">
            {areas.map((area) => (
              <label
                key={area.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  !createNew && selectedAreaId === area.id
                    ? "bg-blue-500/10 border border-blue-500/30"
                    : "hover:bg-zinc-800/50 border border-transparent"
                }`}
              >
                <input
                  type="radio"
                  name="area"
                  checked={!createNew && selectedAreaId === area.id}
                  onChange={() => {
                    setSelectedAreaId(area.id);
                    setCreateNew(false);
                  }}
                  className="accent-blue-500"
                />
                <span className="text-sm text-zinc-200">{area.name}</span>
              </label>
            ))}
            {/* Create new */}
            <label
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                createNew
                  ? "bg-blue-500/10 border border-blue-500/30"
                  : "hover:bg-zinc-800/50 border border-transparent"
              }`}
            >
              <input
                type="radio"
                name="area"
                checked={createNew}
                onChange={() => setCreateNew(true)}
                className="accent-blue-500"
              />
              <Plus size={14} className="text-zinc-400" />
              <span className="text-sm text-zinc-400">Crea nuova area</span>
            </label>
            {createNew && (
              <input
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Nome nuova area..."
                autoFocus
                className="ml-8 w-[calc(100%-2rem)] bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-300 outline-none border border-zinc-700 placeholder-zinc-600"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {!confirmDecline ? (
            <button
              onClick={() => setConfirmDecline(true)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              Rifiuta
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Sei sicuro?</span>
              <button
                onClick={handleDecline}
                disabled={submitting}
                className="px-3 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs transition-colors"
              >
                Conferma rifiuto
              </button>
              <button
                onClick={() => setConfirmDecline(false)}
                className="px-3 py-1.5 text-zinc-400 text-xs"
              >
                Annulla
              </button>
            </div>
          )}
          <button
            onClick={handleAccept}
            disabled={submitting || (!createNew && !selectedAreaId) || (createNew && !newAreaName.trim())}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm text-white transition-colors"
          >
            {submitting ? "..." : "Accetta"}
          </button>
        </div>
      </div>
    </div>
  );
}
