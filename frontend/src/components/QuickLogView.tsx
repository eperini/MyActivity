"use client";

import { useState, useEffect, useMemo } from "react";
import { Zap, Clock, Search, ExternalLink, ChevronLeft, ChevronRight, Calendar, Upload, Download, Pencil, Check, X, Trash2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { QuickLogProject, Epic, WeeklyTimeData } from "@/types";
import { getQuickLogEpics, createEpicTimeLog, getWeeklyTime, triggerTempoPush, triggerTempoImport, updateTimeLog, updateEpicTimeLog, deleteTimeLog, deleteEpicTimeLog } from "@/lib/api";
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

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

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

function formatMins(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
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

  // Tempo sync
  const [pushing, setPushing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Day detail expand + inline edit
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editHours, setEditHours] = useState(0);
  const [editMins, setEditMins] = useState(0);
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Weekly panel state
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeeklyTimeData | null>(null);
  const [weekLoading, setWeekLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [filterProject]);

  useEffect(() => {
    loadWeek();
  }, [weekOffset]);

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

  async function loadWeek() {
    setWeekLoading(true);
    try {
      const data = await getWeeklyTime(weekOffset);
      setWeekData(data);
    } catch {
      // silent
    } finally {
      setWeekLoading(false);
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
      // Refresh week data
      loadWeek();
    } catch {
      showToast("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handlePushTempo() {
    setPushing(true);
    try {
      const result = await triggerTempoPush();
      showToast(`Push completato: ${result.logs_pushed ?? 0} worklog inviati`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore push Tempo");
    } finally {
      setPushing(false);
    }
  }

  async function handleImportTempo() {
    setImporting(true);
    try {
      // Import last 7 days
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const result = await triggerTempoImport(fmt(from), fmt(now));
      showToast(`Import completato: ${result.worklogs_created ?? 0} worklog importati`, "success");
      loadData();
      loadWeek();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore import Tempo");
    } finally {
      setImporting(false);
    }
  }

  function startEditLog(log: { id: number; minutes: number; note: string | null }) {
    setEditingLogId(log.id);
    setEditHours(Math.floor(log.minutes / 60));
    setEditMins(log.minutes % 60);
    setEditNote(log.note || "");
  }

  async function handleEditLogSave(log: { id: number; task_id: number | null; epic_id?: number | null; logged_at: string }) {
    const totalMins = editHours * 60 + editMins;
    if (totalMins <= 0) return;
    setEditSaving(true);
    try {
      if (log.task_id) {
        await updateTimeLog(log.task_id, log.id, { minutes: totalMins, note: editNote.trim() || undefined });
      } else if (log.epic_id) {
        await updateEpicTimeLog(log.epic_id, log.id, { minutes: totalMins, note: editNote.trim() || undefined });
      }
      setEditingLogId(null);
      loadWeek();
    } catch {
      showToast("Errore nel salvataggio");
    } finally {
      setEditSaving(false);
    }
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function handleDeleteLog(log: { id: number; task_id: number | null; epic_id?: number | null }) {
    try {
      if (log.task_id) {
        await deleteTimeLog(log.task_id, log.id);
      } else if (log.epic_id) {
        await deleteEpicTimeLog(log.epic_id, log.id);
      }
      setConfirmDeleteId(null);
      loadWeek();
      loadData();
    } catch {
      showToast("Errore nell'eliminazione");
    }
  }

  // Get all logs for a specific day across all projects
  const dayLogs = useMemo(() => {
    if (!expandedDay || !weekData) return [];
    const logs: { id: number; task_id: number | null; epic_id?: number | null; task_title: string; project_name: string; minutes: number; formatted: string; logged_at: string; note: string | null }[] = [];
    for (const p of weekData.by_project) {
      for (const l of p.logs) {
        if (l.logged_at === expandedDay) {
          logs.push({ ...l, project_name: p.project_name });
        }
      }
    }
    return logs;
  }, [expandedDay, weekData]);

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

  // Build week days array
  const weekDays = useMemo(() => {
    if (!weekData) return [];
    // Parse week_start as local date parts to avoid UTC shift
    const [sy, sm, sd] = weekData.week_start.split("-").map(Number);
    const start = new Date(sy, sm - 1, sd);
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sy, sm - 1, sd + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayEntry = weekData.by_day.find(bd => bd.date === iso);
      return {
        date: iso,
        dayName: DAY_NAMES[i],
        dayNum: d.getDate(),
        month: d.toLocaleDateString("it-IT", { month: "short" }),
        minutes: dayEntry?.minutes || 0,
        isToday: iso === todayIso,
      };
    });
  }, [weekData]);

  // Build project breakdown for the week
  const weekProjects = useMemo(() => {
    if (!weekData) return [];
    return weekData.by_project.map(p => ({
      ...p,
      byDay: weekDays.map(wd => {
        const dayMins = p.logs
          .filter(l => l.logged_at === wd.date)
          .reduce((sum, l) => sum + l.minutes, 0);
        return dayMins;
      }),
    }));
  }, [weekData, weekDays]);

  const weekLabel = weekData
    ? `${new Date(weekData.week_start + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${new Date(weekData.week_end + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`
    : "";

  const [showEpicList, setShowEpicList] = useState(true);
  const [showTimesheet, setShowTimesheet] = useState(true);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Epic list */}
      <div className={`overflow-y-auto p-6 min-w-0 transition-all ${showEpicList ? "flex-1" : "hidden"}`}>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap size={20} className="text-yellow-400" />
            Quick Log Ore
          </h2>
          <div className="flex-1" />
          <button
            onClick={() => setShowTimesheet(!showTimesheet)}
            className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
            title={showTimesheet ? "Nascondi timesheet" : "Mostra timesheet"}
          >
            {showTimesheet ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
          <button
            onClick={handlePushTempo}
            disabled={pushing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 transition-colors"
          >
            <Upload size={14} className={pushing ? "animate-pulse" : ""} />
            {pushing ? "Invio..." : "Invia a Tempo"}
          </button>
          <button
            onClick={handleImportTempo}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 transition-colors"
          >
            <Download size={14} className={importing ? "animate-pulse" : ""} />
            {importing ? "Importo..." : "Aggiorna da Tempo"}
          </button>
        </div>

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
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {proj.project_name}
                  </span>
                  {proj.jira_key && (
                    <span className="text-[10px] text-zinc-600 font-mono">({proj.jira_key})</span>
                  )}
                  <div className="flex-1 border-t border-zinc-800" />
                </div>

                <div className="space-y-1">
                  {proj.epics.map(epic => {
                    const { label: lastLabel, color: dotColor } = daysAgoLabel(epic.last_log_date);
                    const isOpen = openEpicId === epic.id;

                    return (
                      <div key={epic.id}>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/50 group transition-colors">
                          <button
                            onClick={(e) => { e.stopPropagation(); isOpen ? setOpenEpicId(null) : openForm(epic.id); }}
                            className="flex-shrink-0 text-blue-400 hover:text-blue-300 transition-colors"
                            title="Registra ore"
                          >
                            <Clock size={16} />
                          </button>
                          <Zap size={14} className="text-purple-400/60 flex-shrink-0" />
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
                        </div>

                        {isOpen && (
                          <div className="ml-6 mr-3 mb-3 bg-zinc-800/70 rounded-xl p-4 border border-zinc-700/50 overflow-x-auto">
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

      {/* Right: Weekly timesheet */}
      <div className={`flex-shrink-0 border-l border-zinc-800 overflow-y-auto bg-zinc-900/30 transition-all ${!showTimesheet ? "hidden" : showEpicList ? "w-[630px]" : "flex-1"}`}>
        <div className="p-4 space-y-4">
          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEpicList(!showEpicList)}
                className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                title={showEpicList ? "Nascondi lista epic" : "Mostra lista epic"}
              >
                {showEpicList ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              </button>
              <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Calendar size={14} className="text-blue-400" />
                Timesheet
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekOffset(w => w - 1)}
                className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded hover:bg-zinc-800"
                title="Settimana corrente"
              >
                {weekLabel}
              </button>
              <button
                onClick={() => setWeekOffset(w => w + 1)}
                disabled={weekOffset >= 0}
                className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {weekLoading ? (
            <div className="text-center py-8 text-zinc-600 text-xs">Caricamento...</div>
          ) : weekData ? (
            <>
              {/* Day headers + totals row */}
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-800/50">
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Progetto</th>
                      {weekDays.map(d => (
                        <th
                          key={d.date}
                          onClick={() => setExpandedDay(expandedDay === d.date ? null : d.date)}
                          className={`text-center px-1 py-2 font-medium w-12 cursor-pointer transition-colors ${
                            expandedDay === d.date
                              ? "bg-blue-600/20 text-blue-400"
                              : d.isToday ? "text-blue-400 hover:bg-zinc-700/50" : "text-zinc-500 hover:bg-zinc-700/50"
                          }`}
                        >
                          <div>{d.dayName}</div>
                          <div className="text-[10px] font-normal">{d.dayNum}</div>
                        </th>
                      ))}
                      <th className="text-center px-2 py-2 text-zinc-400 font-medium w-14">Tot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekProjects.map(p => (
                      <tr key={p.project_id || "none"} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-zinc-300 truncate max-w-[120px]" title={p.project_name}>
                          {p.project_name}
                        </td>
                        {p.byDay.map((dayMins, i) => (
                          <td
                            key={i}
                            className={`text-center px-1 py-2 ${
                              dayMins > 0 ? "text-zinc-200" : "text-zinc-700"
                            } ${weekDays[i].isToday ? "bg-blue-500/5" : ""}`}
                          >
                            {dayMins > 0 ? formatMins(dayMins) : "–"}
                          </td>
                        ))}
                        <td className="text-center px-2 py-2 text-zinc-300 font-medium">
                          {p.formatted}
                        </td>
                      </tr>
                    ))}
                    {weekProjects.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center py-6 text-zinc-600">
                          Nessuna ora registrata
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {weekProjects.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-zinc-700 bg-zinc-800/50">
                        <td className="px-3 py-2 text-zinc-400 font-medium">Totale</td>
                        {weekDays.map(d => {
                          const dayTotal = weekProjects.reduce(
                            (sum, p) => sum + (p.byDay[weekDays.indexOf(d)] || 0),
                            0
                          );
                          return (
                            <td
                              key={d.date}
                              className={`text-center px-1 py-2 font-medium ${
                                dayTotal > 0 ? "text-zinc-200" : "text-zinc-700"
                              } ${d.isToday ? "bg-blue-500/5" : ""}`}
                            >
                              {dayTotal > 0 ? formatMins(dayTotal) : "–"}
                            </td>
                          );
                        })}
                        <td className="text-center px-2 py-2 text-white font-semibold">
                          {weekData.total_formatted}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Day detail panel */}
              {expandedDay && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-300">
                      {(() => {
                        const d = new Date(expandedDay + "T00:00:00");
                        return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
                      })()}
                    </span>
                    <button onClick={() => { setExpandedDay(null); setEditingLogId(null); }} className="text-zinc-500 hover:text-zinc-300">
                      <X size={14} />
                    </button>
                  </div>
                  {dayLogs.length === 0 ? (
                    <p className="text-xs text-zinc-600 py-2">Nessuna ora registrata</p>
                  ) : (
                    dayLogs.map(log => (
                      <div key={log.id}>
                        {editingLogId === log.id ? (
                          <div className="flex items-center gap-2 py-1.5 px-2 bg-zinc-700/30 rounded-lg">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={23}
                                value={editHours}
                                onChange={e => setEditHours(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-10 bg-zinc-900 border border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-300 outline-none text-center"
                              />
                              <span className="text-[10px] text-zinc-500">h</span>
                              <input
                                type="number"
                                min={0}
                                max={59}
                                value={editMins}
                                onChange={e => setEditMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                className="w-10 bg-zinc-900 border border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-300 outline-none text-center"
                              />
                              <span className="text-[10px] text-zinc-500">m</span>
                            </div>
                            <input
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              placeholder="Nota..."
                              className="flex-1 bg-zinc-900 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-300 outline-none placeholder-zinc-600"
                              onKeyDown={e => {
                                if (e.key === "Enter") handleEditLogSave(log);
                                if (e.key === "Escape") setEditingLogId(null);
                              }}
                            />
                            <button
                              onClick={() => handleEditLogSave(log)}
                              disabled={editSaving || (editHours * 60 + editMins <= 0)}
                              className="p-1 text-blue-400 hover:text-blue-300 disabled:text-zinc-600"
                            >
                              <Check size={14} />
                            </button>
                            <button onClick={() => setEditingLogId(null)} className="p-1 text-zinc-500 hover:text-zinc-300">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-zinc-700/30 group/dlog">
                            <span className="text-emerald-400 font-medium w-12 flex-shrink-0">{log.formatted}</span>
                            <span className="text-zinc-300 flex-1 truncate">{log.task_title}</span>
                            <span className="px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400 text-[10px] font-medium flex-shrink-0">{log.project_name}</span>
                            {log.note && <span className="text-zinc-500 text-[10px] truncate max-w-[100px]" title={log.note}>{log.note}</span>}
                            <button
                              onClick={() => startEditLog(log)}
                              className="opacity-0 group-hover/dlog:opacity-100 p-0.5 text-zinc-600 hover:text-blue-400 transition-all"
                              title="Modifica"
                            >
                              <Pencil size={11} />
                            </button>
                            {confirmDeleteId === log.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDeleteLog(log)}
                                  className="px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 text-[10px] hover:bg-red-600/30 transition-colors"
                                >
                                  Elimina
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="p-0.5 text-zinc-500 hover:text-zinc-300"
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(log.id)}
                                className="opacity-0 group-hover/dlog:opacity-100 p-0.5 text-zinc-600 hover:text-red-400 transition-all"
                                title="Elimina"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div className="flex items-center justify-end pt-1 border-t border-zinc-700/50">
                    <span className="text-xs text-zinc-400 font-medium">
                      Totale: {formatMins(dayLogs.reduce((s, l) => s + l.minutes, 0))}
                    </span>
                  </div>
                </div>
              )}

              {/* Weekly summary bar */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-zinc-500">
                  {weekData.total_minutes > 0
                    ? `${weekData.by_project.length} progett${weekData.by_project.length === 1 ? "o" : "i"}`
                    : ""}
                </span>
                {weekData.total_minutes > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (weekData.total_minutes / (40 * 60)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {Math.round((weekData.total_minutes / (40 * 60)) * 100)}% di 40h
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
