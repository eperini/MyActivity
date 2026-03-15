"use client";

import { useState, useEffect, useMemo } from "react";
import { Zap, Clock, Search, ExternalLink, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import type { QuickLogProject, Epic, WeeklyTimeData } from "@/types";
import { getQuickLogEpics, createEpicTimeLog, getWeeklyTime } from "@/lib/api";
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

  // Weekly panel state
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeeklyTimeData | null>(null);
  const [weekLoading, setWeekLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

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

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Epic list */}
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
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
                          <button
                            onClick={() => isOpen ? setOpenEpicId(null) : openForm(epic.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-500 hover:text-blue-400 hover:bg-zinc-700/50 transition-colors flex-shrink-0"
                          >
                            <Clock size={12} />
                            {isOpen ? "Chiudi" : "Log ore"}
                          </button>
                        </div>

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

      {/* Right: Weekly timesheet */}
      <div className="w-[420px] flex-shrink-0 border-l border-zinc-800 overflow-y-auto bg-zinc-900/30">
        <div className="p-4 space-y-4">
          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Calendar size={14} className="text-blue-400" />
              Timesheet
            </h3>
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
                          className={`text-center px-1 py-2 font-medium w-12 ${
                            d.isToday ? "text-blue-400" : "text-zinc-500"
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
