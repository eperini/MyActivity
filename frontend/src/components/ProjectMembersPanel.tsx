"use client";

import { useState, useEffect } from "react";
import { Users, Mail, Trash2, ChevronDown, Plus, X, UserPlus, Shield, Crown } from "lucide-react";
import type { ProjectMember, ProjectInvitation, ProjectRole } from "@/types";
import {
  getProjectMembers,
  removeProjectMember,
  getProjectInvitations,
  sendProjectInvitation,
  cancelProjectInvitation,
  updateMemberRole,
} from "@/lib/api";
import { useToast } from "./Toast";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  super_user: "Super User",
  user: "User",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "text-yellow-400",
  super_user: "text-blue-400",
  user: "text-zinc-400",
};

interface Props {
  projectId: number;
  currentUserRole?: string | null;
  ownerId: number;
  currentUserId: number;
}

export default function ProjectMembersPanel({ projectId, currentUserRole, ownerId, currentUserId }: Props) {
  const { showToast } = useToast();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<string>("user");
  const [sending, setSending] = useState(false);

  const isAdmin = currentUserRole === "admin" || currentUserId === ownerId;

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        getProjectMembers(projectId),
        isAdmin ? getProjectInvitations(projectId) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvitations(i.filter((inv: ProjectInvitation) => inv.status === "pending"));
    } catch {
      showToast("Errore caricamento membri");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!invEmail.trim()) return;
    setSending(true);
    try {
      await sendProjectInvitation(projectId, { email: invEmail.trim(), role: invRole });
      showToast("Invito inviato", "success");
      setInvEmail("");
      setShowInvite(false);
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore invio invito";
      showToast(msg);
    } finally {
      setSending(false);
    }
  }

  async function handleRemoveMember(memberId: number) {
    try {
      await removeProjectMember(projectId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      showToast("Membro rimosso", "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore";
      showToast(msg);
    }
  }

  async function handleChangeRole(memberId: number, newRole: string) {
    try {
      await updateMemberRole(projectId, memberId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore";
      showToast(msg);
    }
  }

  async function handleCancelInvitation(invId: number) {
    try {
      await cancelProjectInvitation(projectId, invId);
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
      showToast("Invito cancellato", "success");
    } catch {
      showToast("Errore");
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500 py-4">Caricamento membri...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Users size={14} />
          Membri del progetto ({members.length})
        </h3>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:bg-zinc-800 rounded transition-colors"
          >
            <UserPlus size={12} />
            Invita
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2 border border-zinc-700/50">
          <div className="flex gap-2">
            <input
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              placeholder="Email utente..."
              className="flex-1 bg-zinc-900 rounded px-3 py-1.5 text-sm text-zinc-300 outline-none border border-zinc-700 placeholder-zinc-600"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
            <select
              value={invRole}
              onChange={(e) => setInvRole(e.target.value)}
              className="bg-zinc-900 rounded px-2 py-1.5 text-sm text-zinc-300 outline-none border border-zinc-700"
            >
              <option value="user">User</option>
              <option value="super_user">Super User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowInvite(false)}
              className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-300"
            >
              Annulla
            </button>
            <button
              onClick={handleInvite}
              disabled={sending || !invEmail.trim()}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 rounded text-xs text-white transition-colors"
            >
              {sending ? "..." : "Invia invito"}
            </button>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-1">
        {members.map((member) => {
          const initials = member.display_name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const isOwner = member.user_id === ownerId;

          return (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 group"
            >
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-300 flex-shrink-0">
                {initials}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-200 truncate">{member.display_name}</span>
                  {isOwner && <Crown size={10} className="text-yellow-400 flex-shrink-0" />}
                </div>
                <span className="text-[10px] text-zinc-500">{member.email}</span>
              </div>

              {/* Role */}
              {isAdmin && !isOwner && member.user_id !== currentUserId ? (
                <select
                  value={member.role}
                  onChange={(e) => handleChangeRole(member.id, e.target.value)}
                  className="bg-transparent text-xs text-zinc-400 outline-none cursor-pointer"
                >
                  <option value="user">User</option>
                  <option value="super_user">Super User</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className={`text-xs ${ROLE_COLORS[member.role] || "text-zinc-400"}`}>
                  {ROLE_LABELS[member.role] || member.role}
                </span>
              )}

              {/* Remove button */}
              {isAdmin && !isOwner && member.user_id !== currentUserId && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Rimuovi membro"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Pending invitations */}
      {isAdmin && invitations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Inviti pendenti
          </h4>
          <div className="space-y-1">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/30 group"
              >
                <Mail size={14} className="text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-400 flex-1 truncate">{inv.email}</span>
                <span className="text-xs text-zinc-500">{ROLE_LABELS[inv.role] || inv.role}</span>
                <span className="text-[10px] text-zinc-600">
                  scade {new Date(inv.expires_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </span>
                <button
                  onClick={() => handleCancelInvitation(inv.id)}
                  className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
