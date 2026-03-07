"use client";

import { useState, useEffect } from "react";
import { X, UserPlus, Trash2, Crown, Pencil, Eye } from "lucide-react";
import type { ListMember, TaskList } from "@/types";
import { getListMembers, addListMember, removeListMember } from "@/lib/api";

interface ShareListModalProps {
  list: TaskList;
  currentUserId?: number;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, { label: string; icon: typeof Crown }> = {
  owner: { label: "Proprietario", icon: Crown },
  edit: { label: "Modifica", icon: Pencil },
  view: { label: "Sola lettura", icon: Eye },
};

export default function ShareListModal({ list, currentUserId, onClose }: ShareListModalProps) {
  const [members, setMembers] = useState<ListMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("edit");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [list.id]);

  async function loadMembers() {
    try {
      const m = await getListMembers(list.id);
      setMembers(m);
    } catch {
      console.error("Failed to load members");
    }
  }

  async function handleAdd() {
    if (!email.trim()) return;
    setError("");
    setLoading(true);
    try {
      await addListMember(list.id, email.trim(), role);
      setEmail("");
      loadMembers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(memberId: number) {
    try {
      await removeListMember(list.id, memberId);
      loadMembers();
    } catch {
      console.error("Failed to remove member");
    }
  }

  const isOwner = list.owner_id === currentUserId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-800 border border-zinc-700 rounded-xl w-96 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: list.color }} />
            <h3 className="text-sm font-medium text-white">Condividi &quot;{list.name}&quot;</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Add member */}
        {isOwner && (
          <div className="px-5 py-3 border-b border-zinc-700/50">
            <div className="flex gap-2">
              <input
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="Email utente..."
                className="flex-1 bg-zinc-700 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder-zinc-500"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-zinc-700 text-sm text-zinc-300 rounded-lg px-2 outline-none"
              >
                <option value="edit">Modifica</option>
                <option value="view">Lettura</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={loading || !email.trim()}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 rounded-lg text-white transition-colors"
              >
                <UserPlus size={16} />
              </button>
            </div>
            {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
          </div>
        )}

        {/* Members list */}
        <div className="flex-1 overflow-y-auto">
          {members.map((m) => {
            const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS.view;
            const RoleIcon = roleInfo.icon;
            return (
              <div key={`${m.role}-${m.user_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-700/30">
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-300">
                  {m.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{m.display_name}</div>
                  <div className="text-xs text-zinc-500 truncate">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <RoleIcon size={12} />
                    {roleInfo.label}
                  </span>
                  {isOwner && m.role !== "owner" && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
