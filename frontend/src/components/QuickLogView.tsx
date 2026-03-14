"use client";

import { useState, useEffect } from "react";
import { Zap, Clock, Search, ExternalLink, Plus, X } from "lucide-react";
import type { QuickLogProject, Epic } from "@/types";
import { getQuickLogEpics, createEpicTimeLog } from "@/lib/api";
import { useToast } from "./Toast";
import TimeLogForm from "./TimeLogForm";

const STATUS_LABELS: Record<string, string> = {
  todo: "da fare",
  in_progress: "in corso",
  done: "completato",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "text-zinc-500",
  in_progress: "text-blue-400",
  done: "text-green-400",
};

function daysAgoLabel(dateStr: string | undefined | null): { label: string; color: string } {
  if (!dateStr) return { label: "", color: "bg-zinc-600" };
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { label: "oggi", color: "bg-green-400" };
  if (diffDays <= 7) return { label: `${diffDays}g fa`, color: "bg-yellow-400" };
  return {
    label: d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }),
    color: "bg-zinc-500",
  };
}

export default function QuickLogView() {
  const { showToast } = useToast();
  const [projects, setProjects] = useState<QuickLogProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<number | "">("");
  const [openEpicId, setOpenEpicId] = useState<number | null>(null);

  // Form state
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getQuickLogEpics(
        filterProject ? { project_id: Number(filterProject) } : undefined
      );
      setProjects(data);
    } catch {
      showToast("Errore caricamento epic");
    } finally {
      setLoading(false);
    }
  }

  function openForm(epicId: number) {
    setOpenEpicId(epicId);
    setLogDate(new Date().toISOString().split("T")[0]);
    setHours(0);
    setMins(0);
    setNote("");
  }

  async function handleSave(epic: Epic) {
    const totalMins = hours * 60 + mins;
    if (totalMins <= 0) return;
    setSaving(true);
    try {
      await createEpicTimeLog(epic.id, {
        minutes: totalMins,
        logged_at: logDate,
        note: note.trim() || undefined,
      });
      // Update local state optimistically
      setProjects(prev =>
        prev.map(p => ({
          ...p,
          epics: p.epics.map(e =>
            e.id === epic.id
              ? {
                  ...e,
                  total_logged_minutes: e.total_logged_minutes + totalMins,
                  total_logged_formatted: formatMins(e.total_logged_minutes + totalMins),
                  last_log_date: logDate,
                }
              : e
          ),
        }))
      );
      setOpenEpicId(null);
      showToast("Ore registrate", "success");
    } catch {
      showToast("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function formatMins(m: number): string {
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return `${h}h ${r}m`;
    if (h) return `${h}h`;
    return `${r}m`;
  }

  // Filter epics by search
  const filtered = projects
    .map(p => ({
      ...p,
      epics: p.epics.filter(e =>
        !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.jira_issue_key && e.jira_issue_key.toLowerCase().includes(search.toLowerCase()))
      ),
    }))
    .filter(p => p.epics.length > 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <Zap size={20} className="text-yellow-400" />
        Quick Log Ore
      </h2>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca epic..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 outline-none focus:border-zinc-500 placeholder-zinc-600"
          />
        </div>
        <select
          value={filterProject}
          onChange={e => { setFilterProject(e.target.value ? Number(e.target.value) : ""); }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none"
        >
          <option value="">Tutti i progetti</option>
          {projects.map(p => (
            <option key={p.project_id} value={p.project_id}>{p.project_name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-500 text-sm">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          Nessun epic trovato. Crea epic nei tuoi progetti o sincronizza da Jira.
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map(proj => (
            <div key={proj.project_id}>
              {/* Project header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  {proj.project_name}
                </span>
                {proj.jira_key && (
                  <span className="text-[10px] text-zinc-600 font-mono">({proj.jira_key})</span>
                )}
                <div className="flex-1 border-t border-zinc-800" />
              </div>

              {/* Epics */}
              <div className="space-y-1">
                {proj.epics.map(epic => {
                  const { label: lastLabel, color: dotColor } = daysAgoLabel(epic.last_log_date);
                  const isOpen = openEpicId === epic.id;

                  return (
                    <div key={epic.id}>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/50 group transition-colors">
                        <Zap size={14} className="text-yellow-400/60 flex-shrink-0" />
                        <span className="text-sm text-zinc-200 flex-1 truncate">{epic.name}</span>
                        {epic.jira_issue_key && (
                          <a
                            href={epic.jira_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-zinc-500 font-mono hover:text-blue-400 flex items-center gap-0.5"
                            onClick={e => e.stopPropagation()}
                          >
                            {epic.jira_issue_key}
                            <ExternalLink size={8} />
                          </a>
                        )}
                        <span className="text-xs text-zinc-400 w-16 text-right flex-shrink-0">
                          {epic.total_logged_formatted}
                        </span>
                        <span className={`text-[10px] ${STATUS_COLORS[epic.status]} w-14 text-right flex-shrink-0`}>
                          {STATUS_LABELS[epic.status] || epic.status}
                        </span>
                        {lastLabel && (
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                            <span className="text-[10px] text-zinc-500">{lastLabel}</span>
                          </span>
                        )}
                        <button
                          onClick={() => isOpen ? setOpenEpicId(null) : openForm(epic.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-500 hover:text-blue-400 hover:bg-zinc-700/50 transition-colors flex-shrink-0"
                        >
                          <Clock size={12} />
                          {isOpen ? "Chiudi" : "Log ore"}
                        </button>
                      </div>

                      {/* Inline form */}
                      {isOpen && (
                        <div className="ml-6 mr-3 mb-3 bg-zinc-800/70 rounded-xl p-4 border border-zinc-700/50">
                          <TimeLogForm
                            logDate={logDate}
                            onDateChange={setLogDate}
                            hours={hours}
                            onHoursChange={setHours}
                            mins={mins}
                            onMinsChange={setMins}
                            note={note}
                            onNoteChange={setNote}
                            onSave={() => handleSave(epic)}
                            onCancel={() => setOpenEpicId(null)}
                            saving={saving}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
