"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Check, CheckCheck, Trash2, X, ExternalLink } from "lucide-react";
import type { ZenoNotification } from "@/types";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "@/lib/api";

const TYPE_EMOJI: Record<string, string> = {
  task_assigned: "👤",
  task_status_changed: "🔄",
  task_commented: "💬",
  task_due_soon: "⏰",
  project_invitation: "📩",
  sprint_started: "🚀",
  sprint_completed: "✅",
  mention: "🔔",
  automation_triggered: "⚙️",
  tempo_sync_error: "⚠️",
  report_ready: "📊",
};

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "ora";
  if (diffMins < 60) return `${diffMins}m fa`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h fa`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "ieri";
  if (diffDays < 7) return `${diffDays}g fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate?: (projectId?: number, taskId?: number) => void;
}

export default function NotificationsPanel({ open, onClose, onNavigate }: Props) {
  const [notifications, setNotifications] = useState<ZenoNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications(50, 0);
      setNotifications(data.notifications);
      setTotal(data.total);
      setUnread(data.unread);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleMarkRead(id: number) {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnread((u) => Math.max(0, u - 1));
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  }

  async function handleDelete(id: number) {
    const n = notifications.find((n) => n.id === id);
    await deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setTotal((t) => t - 1);
    if (n && !n.is_read) setUnread((u) => Math.max(0, u - 1));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-zinc-400" />
            <span className="text-sm font-medium text-white">Notifiche</span>
            {unread > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-medium">
                {unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-400 hover:text-blue-400 flex items-center gap-1"
              >
                <CheckCheck size={12} />
                Segna tutte lette
              </button>
            )}
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-zinc-500 text-sm">Caricamento...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              Nessuna notifica
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 hover:bg-zinc-800/40 transition-colors group ${
                    !n.is_read ? "bg-zinc-800/20" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Read indicator */}
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        n.is_read ? "bg-zinc-700" : "bg-blue-500"
                      }`}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{TYPE_EMOJI[n.type] || "📌"}</span>
                        <span className="text-sm text-zinc-200 font-medium truncate">
                          {n.title}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <span className="text-[10px] text-zinc-600 mt-1 block">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {!n.is_read && (
                        <button
                          onClick={() => handleMarkRead(n.id)}
                          className="p-1 text-zinc-500 hover:text-blue-400"
                          title="Segna come letta"
                        >
                          <Check size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="p-1 text-zinc-500 hover:text-red-400"
                        title="Elimina"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
