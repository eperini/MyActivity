"use client";

import { useEffect, useState } from "react";
import { Clock, Plus, Trash2, X } from "lucide-react";
import type { TimeLog } from "@/types";
import { getTimeLogs, createTimeLog, deleteTimeLog } from "@/lib/api";
import { useToast } from "./Toast";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface TimeLogPanelProps {
  taskId: number;
  estimatedMinutes?: number | null;
  timeLoggedMinutes?: number;
  onRefresh?: () => void;
}

export default function TimeLogPanel({ taskId, estimatedMinutes, timeLoggedMinutes = 0, onRefresh }: TimeLogPanelProps) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(0);
  const [note, setNote] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTimeLogs(taskId)
      .then(setLogs)
      .catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento ore"); });
  }, [taskId]);

  const totalLogged = logs.reduce((sum, l) => sum + l.minutes, 0);

  function formatMins(m: number): string {
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return `${h}h ${r}m`;
    if (h) return `${h}h`;
    return `${r}m`;
  }

  async function handleAdd() {
    const totalMins = hours * 60 + mins;
    if (totalMins <= 0) return;
    setSaving(true);
    try {
      const log = await createTimeLog(taskId, {
        minutes: totalMins,
        logged_at: logDate,
        note: note.trim() || undefined,
      });
      setLogs((prev) => [log, ...prev]);
      setHours(0);
      setMins(0);
      setNote("");
      setShowForm(false);
      onRefresh?.();
    } catch {
      showToast("Errore nel salvataggio ore");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(logId: number) {
    try {
      await deleteTimeLog(taskId, logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      onRefresh?.();
    } catch {
      showToast("Errore nell'eliminazione del log");
    }
  }

  const progressPct = estimatedMinutes && estimatedMinutes > 0
    ? Math.min(100, (totalLogged / estimatedMinutes) * 100)
    : null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-3 text-sm">
        <Clock size={16} className="text-zinc-500" />
        <span className="text-zinc-500 text-xs flex-1">
          Ore registrate
          {totalLogged > 0 && (
            <span className="text-zinc-300 ml-1">
              {formatMins(totalLogged)}
              {estimatedMinutes ? ` / ${formatMins(estimatedMinutes)}` : ""}
            </span>
          )}
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-zinc-500 hover:text-blue-400 transition-colors"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
        </button>
      </div>

      {/* Progress bar */}
      {progressPct !== null && (
        <div className="ml-7">
          <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressPct >= 100 ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="ml-7 bg-zinc-800/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-12 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none text-center"
              />
              <span className="text-xs text-zinc-500">h</span>
              <input
                type="number"
                min={0}
                max={59}
                value={mins}
                onChange={(e) => setMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                className="w-12 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none text-center"
              />
              <span className="text-xs text-zinc-500">m</span>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota (opzionale)..."
              className="flex-1 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none placeholder-zinc-600"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <button
              onClick={handleAdd}
              disabled={saving || (hours * 60 + mins <= 0)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs text-white transition-colors"
            >
              Salva
            </button>
          </div>
        </div>
      )}

      {/* Log list */}
      {logs.length > 0 && (
        <div className="ml-7 space-y-1 max-h-40 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center gap-2 text-xs group/log">
              <span className="text-zinc-500 w-14 flex-shrink-0">
                {format(parseISO(log.logged_at), "d MMM", { locale: it })}
              </span>
              <span className="text-zinc-300 w-12 flex-shrink-0">{log.formatted}</span>
              <span className="text-zinc-500 flex-1 truncate">{log.note || ""}</span>
              <span className="text-[10px] text-zinc-600 flex-shrink-0">{log.user_name}</span>
              <button
                onClick={() => handleDelete(log.id)}
                className="opacity-0 group-hover/log:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
