"use client";

import { useEffect, useState } from "react";
import { Clock, Plus, Trash2, X, RefreshCw, AlertTriangle } from "lucide-react";
import type { TimeLog } from "@/types";
import { getTimeLogs, createTimeLog, deleteTimeLog, skipTempoPush, pushLogNow } from "@/lib/api";
import { useToast } from "./Toast";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import TimeLogForm from "./TimeLogForm";

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
  const [pushingId, setPushingId] = useState<number | null>(null);

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

  async function handleSkipTempo(logId: number) {
    try {
      await skipTempoPush(logId);
      setLogs((prev) => prev.map(l => l.id === logId ? { ...l, tempo_push_status: "skipped" } : l));
    } catch {
      showToast("Errore");
    }
  }

  async function handlePushNow(logId: number) {
    setPushingId(logId);
    try {
      const res = await pushLogNow(logId);
      setLogs((prev) => prev.map(l => l.id === logId
        ? { ...l, tempo_push_status: "pushed", jira_issue_key: res.jira_issue_key }
        : l
      ));
      showToast("Pushato su Tempo", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore push");
    } finally {
      setPushingId(null);
    }
  }

  function pushBadge(log: TimeLog) {
    if (log.source === "tempo") return null;
    if (!log.tempo_push_status || log.tempo_push_status === "ignored") return null;

    switch (log.tempo_push_status) {
      case "pushed":
        return (
          <span className="px-1 py-0.5 rounded bg-green-900/30 text-green-400 text-[8px]">
            {log.jira_issue_key || "Tempo"}
          </span>
        );
      case "pending":
        return (
          <span className="px-1 py-0.5 rounded bg-yellow-900/30 text-yellow-400 text-[8px]">
            pending
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-0.5">
            <span className="px-1 py-0.5 rounded bg-red-900/30 text-red-400 text-[8px]" title={log.tempo_push_error || ""}>
              errore
            </span>
            <button
              onClick={() => handlePushNow(log.id)}
              disabled={pushingId === log.id}
              className="text-zinc-500 hover:text-blue-400 transition-colors"
              title="Riprova push"
            >
              <RefreshCw size={10} className={pushingId === log.id ? "animate-spin" : ""} />
            </button>
          </span>
        );
      case "skipped":
        return (
          <span className="px-1 py-0.5 rounded bg-zinc-700 text-zinc-500 text-[8px]">
            ignorato
          </span>
        );
      default:
        return null;
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
        <div className="ml-7 bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
          <TimeLogForm
            logDate={logDate}
            onDateChange={setLogDate}
            hours={hours}
            onHoursChange={setHours}
            mins={mins}
            onMinsChange={setMins}
            note={note}
            onNoteChange={setNote}
            onSave={handleAdd}
            onCancel={() => setShowForm(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Log list */}
      {logs.length > 0 && (
        <div className="ml-7 space-y-1 max-h-40 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id}>
              <div className="flex items-center gap-2 text-xs group/log">
                <span className="text-zinc-500 w-14 flex-shrink-0">
                  {format(parseISO(log.logged_at), "d MMM", { locale: it })}
                </span>
                <span className="text-zinc-300 w-12 flex-shrink-0">{log.formatted}</span>
                <span className="text-zinc-500 flex-1 truncate">{log.note || ""}</span>
                <span className="text-[10px] text-zinc-600 flex-shrink-0 flex items-center gap-1">
                  {log.user_name}
                  {log.source === "tempo" && <span className="px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 text-[8px]">Tempo</span>}
                  {pushBadge(log)}
                </span>
                <button
                  onClick={() => handleDelete(log.id)}
                  className="opacity-0 group-hover/log:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {/* Warning for pending log without Jira */}
              {log.source === "manual" && log.tempo_push_status === "pending" && !log.jira_issue_key && (
                <div className="ml-14 mt-0.5 mb-1 flex items-start gap-1.5 text-[10px] text-yellow-400/80">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                  <div>
                    <span>Task non collegato a Jira — ore non sincronizzate con Tempo</span>
                    <div className="flex gap-2 mt-0.5">
                      <button
                        onClick={() => handlePushNow(log.id)}
                        disabled={pushingId === log.id}
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        {pushingId === log.id ? "..." : "Crea su Jira e sincronizza"}
                      </button>
                      <button
                        onClick={() => handleSkipTempo(log.id)}
                        className="text-zinc-500 hover:text-zinc-400 underline"
                      >
                        Ignora
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
