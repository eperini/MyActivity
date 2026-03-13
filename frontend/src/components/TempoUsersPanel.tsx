"use client";

import { useState, useEffect } from "react";
import { Users, Link2, UserX, Check } from "lucide-react";
import { getTempoUsers, linkTempoUser, deactivateTempoUser, listUsers } from "@/lib/api";
import type { TempoUser } from "@/types";
import { useToast } from "@/components/Toast";

interface ZenoUser {
  id: number;
  email: string;
  display_name: string;
}

export default function TempoUsersPanel() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<TempoUser[]>([]);
  const [zenoUsers, setZenoUsers] = useState<ZenoUser[]>([]);
  const [linkSelections, setLinkSelections] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    getTempoUsers().then(setUsers).catch(() => {});
    listUsers().then(setZenoUsers).catch(() => {});
  }, []);

  async function handleLink(tempoUser: TempoUser) {
    const selectedValue = linkSelections[tempoUser.id];
    const zenoUserId = selectedValue ? Number(selectedValue) : null;
    setSaving(tempoUser.id);
    try {
      await linkTempoUser(tempoUser.id, zenoUserId);
      setUsers(prev => prev.map(u => u.id === tempoUser.id ? { ...u, zeno_user_id: zenoUserId } : u));
      showToast(zenoUserId ? "Utente collegato" : "Collegamento rimosso", "success");
    } catch {
      showToast("Errore collegamento utente");
    } finally {
      setSaving(null);
    }
  }

  async function handleDeactivate(id: number) {
    try {
      await deactivateTempoUser(id);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: !u.is_active } : u));
      const user = users.find(u => u.id === id);
      showToast(user?.is_active ? "Utente disattivato" : "Utente riattivato", "success");
    } catch {
      showToast("Errore modifica stato utente");
    }
  }

  if (users.length === 0) {
    return (
      <div className="text-xs text-zinc-500 py-2">
        Nessun utente Tempo trovato. Esegui un import per rilevare gli utenti.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Users size={16} className="text-blue-400" />
        <span className="text-sm text-zinc-300">Utenti Tempo ({users.length})</span>
      </div>

      <div className="space-y-2">
        {users.map(tu => (
          <div key={tu.id} className={`bg-zinc-900 rounded-lg px-3 py-2.5 space-y-2 ${!tu.is_active ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-200 font-medium">{tu.display_name}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{tu.tempo_account_id}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-300">{tu.total_formatted}</div>
                <div className="text-[10px] text-zinc-500">{tu.total_logs} log</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link2 size={12} className="text-zinc-500 shrink-0" />
              <select
                value={linkSelections[tu.id] ?? (tu.zeno_user_id?.toString() || "")}
                onChange={(e) => setLinkSelections(prev => ({ ...prev, [tu.id]: e.target.value }))}
                className="flex-1 bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none"
              >
                <option value="">Nessun utente Zeno</option>
                {zenoUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>
                ))}
              </select>
              <button
                onClick={() => handleLink(tu)}
                disabled={saving === tu.id}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs text-white transition-colors"
              >
                {saving === tu.id ? "..." : <Check size={12} />}
              </button>
              <button
                onClick={() => handleDeactivate(tu.id)}
                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                title={tu.is_active ? "Disattiva" : "Riattiva"}
              >
                <UserX size={14} />
              </button>
            </div>

            {tu.zeno_user_id && (
              <div className="text-[10px] text-green-400/70">
                Collegato a {zenoUsers.find(u => u.id === tu.zeno_user_id)?.display_name || `utente #${tu.zeno_user_id}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
