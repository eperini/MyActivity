"use client";

import { useState, useEffect } from "react";
import { Users, Pencil, Trash2, Shield, ShieldOff, Check, X, Save } from "lucide-react";
import { getUsers, adminUpdateUser, adminDeleteUser, type AdminUser } from "@/lib/api";
import { useToast } from "./Toast";

export default function UserManagementPanel() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", email: "", password: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => showToast("Errore caricamento utenti"))
      .finally(() => setLoading(false));
  }, []);

  function startEdit(u: AdminUser) {
    setEditingId(u.id);
    setEditForm({ display_name: u.display_name, email: u.email, password: "" });
  }

  async function handleSave(userId: number) {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      const original = users.find((u) => u.id === userId);
      if (editForm.display_name !== original?.display_name) data.display_name = editForm.display_name;
      if (editForm.email !== original?.email) data.email = editForm.email;
      if (editForm.password) data.password = editForm.password;
      if (Object.keys(data).length === 0) {
        setEditingId(null);
        return;
      }
      const updated = await adminUpdateUser(userId, data);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      setEditingId(null);
      showToast("Utente aggiornato", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore aggiornamento");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAdmin(u: AdminUser) {
    try {
      const updated = await adminUpdateUser(u.id, { is_admin: !u.is_admin });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      showToast(updated.is_admin ? "Admin abilitato" : "Admin rimosso", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore");
    }
  }

  async function handleDelete(userId: number) {
    try {
      await adminDeleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
      showToast("Utente eliminato", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore eliminazione");
    }
  }

  if (loading) return <p className="text-xs text-zinc-400">Caricamento utenti...</p>;

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-zinc-500">
        {users.length} utenti registrati. Modifica nome, email, password e diritti admin.
      </p>
      <div className="space-y-1">
        {users.map((u) => (
          <div key={u.id} className="bg-zinc-900 rounded-lg px-3 py-2">
            {editingId === u.id ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={editForm.display_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="Nome"
                    className="flex-1 bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none"
                  />
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Email"
                    className="flex-1 bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Nuova password (vuoto = invariata)"
                    type="password"
                    className="flex-1 bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none"
                  />
                  <button
                    onClick={() => handleSave(u.id)}
                    disabled={saving}
                    className="p-1.5 text-green-400 hover:text-green-300 disabled:opacity-50"
                    title="Salva"
                  >
                    <Save size={14} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300"
                    title="Annulla"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-200 font-medium">{u.display_name}</span>
                    {u.is_admin && (
                      <span className="text-[9px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded">Admin</span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">{u.email}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(u)}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Modifica"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleToggleAdmin(u)}
                    className={`p-1.5 transition-colors ${u.is_admin ? "text-blue-400 hover:text-blue-300" : "text-zinc-600 hover:text-blue-400"}`}
                    title={u.is_admin ? "Rimuovi admin" : "Rendi admin"}
                  >
                    {u.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}
                  </button>
                  {deleteConfirm === u.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="p-1.5 text-red-400 hover:text-red-300"
                        title="Conferma eliminazione"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-300"
                        title="Annulla"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(u.id)}
                      className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                      title="Elimina"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
