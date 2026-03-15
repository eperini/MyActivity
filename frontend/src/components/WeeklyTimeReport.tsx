"use client";

import { useEffect, useState, useMemo } from "react";
import { Clock, ChevronLeft, ChevronRight, Download, Calendar } from "lucide-react";
import type { WeeklyTimeData } from "@/types";
import { getWeeklyTime, getTimeReport } from "@/lib/api";
import type { TimeReportData } from "@/lib/api";
import { useToast } from "./Toast";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";

function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return "http://localhost:8000/api";
  return `http://${window.location.hostname}:8000/api`;
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMins(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

type PeriodMode = "week" | "month" | "custom";

const PRESET_PERIODS = [
  { label: "Settimana corrente", value: "week" },
  { label: "Mese corrente", value: "month" },
  { label: "Periodo personalizzato", value: "custom" },
] as const;

export default function WeeklyTimeReport() {
  const { showToast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeeklyTimeData | null>(null);
  const [reportData, setReportData] = useState<TimeReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PeriodMode>("week");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupBy, setGroupBy] = useState<"day" | "project" | "task">("day");

  // Load week data
  useEffect(() => {
    if (mode === "week") loadWeek();
  }, [weekOffset, mode]);

  // Load report data for month/custom
  useEffect(() => {
    if (mode === "month") {
      const now = new Date();
      const ms = startOfMonth(now);
      const me = endOfMonth(now);
      loadReport(toLocalIso(ms), toLocalIso(me));
    }
  }, [mode, groupBy]);

  async function loadWeek() {
    setLoading(true);
    try {
      const d = await getWeeklyTime(weekOffset);
      setWeekData(d);
      setReportData(null);
    } catch (e) {
      if (e instanceof Error && e.message !== "Non autorizzato") {
        showToast("Errore caricamento report ore");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadReport(from: string, to: string) {
    setLoading(true);
    try {
      const d = await getTimeReport({ date_from: from, date_to: to, group_by: groupBy });
      setReportData(d);
      setWeekData(null);
    } catch (e) {
      if (e instanceof Error && e.message !== "Non autorizzato") {
        showToast("Errore caricamento report");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCustomSearch() {
    if (!dateFrom || !dateTo) {
      showToast("Seleziona entrambe le date");
      return;
    }
    if (dateFrom > dateTo) {
      showToast("La data di inizio deve essere prima della fine");
      return;
    }
    loadReport(dateFrom, dateTo);
  }

  function handleExport() {
    let url = `${getApiUrl()}/time/export?fmt=csv`;
    if (mode === "month") {
      const now = new Date();
      url += `&date_from=${toLocalIso(startOfMonth(now))}&date_to=${toLocalIso(endOfMonth(now))}`;
    } else if (mode === "custom" && dateFrom && dateTo) {
      url += `&date_from=${dateFrom}&date_to=${dateTo}`;
    }
    window.open(url, "_blank");
  }

  // Build full week for week mode
  const fullWeek = useMemo(() => {
    if (!weekData) return [];
    const [sy, sm, sd] = weekData.week_start.split("-").map(Number);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sy, sm - 1, sd + i);
      const dateStr = toLocalIso(d);
      const dayData = weekData.by_day.find((dd) => dd.date === dateStr);
      return {
        date: dateStr,
        dayName: DAY_NAMES[i],
        dayNum: d.getDate(),
        minutes: dayData?.minutes || 0,
        formatted: dayData?.formatted || "",
      };
    });
  }, [weekData]);

  const maxDayMinutes = weekData ? Math.max(...(weekData.by_day.map((d) => d.minutes)), 1) : 1;

  const data = weekData || reportData;
  const periodLabel = weekData
    ? `${format(parseISO(weekData.week_start), "d MMM", { locale: it })} – ${format(parseISO(weekData.week_end), "d MMM yyyy", { locale: it })}`
    : mode === "month"
      ? format(new Date(), "MMMM yyyy", { locale: it })
      : dateFrom && dateTo
        ? `${format(parseISO(dateFrom), "d MMM", { locale: it })} – ${format(parseISO(dateTo), "d MMM yyyy", { locale: it })}`
        : "";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock size={20} />
            Report Ore
          </h2>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Period selector */}
      <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setMode(p.value as PeriodMode); setWeekOffset(0); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === p.value ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Week navigation */}
        {mode === "week" && (
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors">
              <ChevronLeft size={16} className="text-zinc-300" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
            >
              {periodLabel || "Caricamento..."}
            </button>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              disabled={weekOffset >= 0}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 rounded-lg transition-colors"
            >
              <ChevronRight size={16} className="text-zinc-300" />
            </button>
          </div>
        )}

        {/* Custom date range */}
        {mode === "custom" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">Da</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">A</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-zinc-500"
              />
            </div>
            <button
              onClick={handleCustomSearch}
              className="mt-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium text-white transition-colors"
            >
              Cerca
            </button>
          </div>
        )}

        {/* Group by (for month/custom) */}
        {mode !== "week" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Raggruppa per:</span>
            {(["day", "project", "task"] as const).map((g) => (
              <button
                key={g}
                onClick={() => {
                  setGroupBy(g);
                  if (mode === "custom" && dateFrom && dateTo) loadReport(dateFrom, dateTo);
                }}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  groupBy === g ? "bg-zinc-600 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {g === "day" ? "Giorno" : g === "project" ? "Progetto" : "Task"}
              </button>
            ))}
          </div>
        )}

        {periodLabel && mode !== "week" && (
          <p className="text-sm text-zinc-400">{periodLabel}</p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-500 text-sm">Caricamento...</div>
      ) : !data ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {mode === "custom" ? "Seleziona un periodo e premi Cerca" : "Nessun dato disponibile"}
        </div>
      ) : (
        <>
          {/* Total */}
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <div className="text-3xl font-bold text-white">
              {weekData ? weekData.total_formatted : reportData?.total_formatted}
            </div>
            <div className="text-sm text-zinc-500 mt-1">
              Totale {mode === "week" ? "settimana" : "periodo"}
            </div>
          </div>

          {/* WEEK MODE: by project + by day + detail */}
          {weekData && (
            <>
              {weekData.by_project.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-zinc-400">Per progetto</h3>
                  {weekData.by_project.map((proj, i) => {
                    const pct = weekData.total_minutes > 0 ? (proj.minutes / weekData.total_minutes) * 100 : 0;
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-300">{proj.project_name}</span>
                          <span className="text-zinc-400">{proj.formatted}</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-400">Per giorno</h3>
                <div className="space-y-2">
                  {fullWeek.map((day) => {
                    const pct = maxDayMinutes > 0 ? (day.minutes / maxDayMinutes) * 100 : 0;
                    const todayIso = toLocalIso(new Date());
                    const isToday = day.date === todayIso;
                    return (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className={`w-10 text-xs ${isToday ? "text-blue-400 font-medium" : "text-zinc-500"}`}>
                          {day.dayName} {day.dayNum}
                        </span>
                        <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                          {day.minutes > 0 && (
                            <div className="h-full bg-emerald-600 rounded transition-all" style={{ width: `${pct}%` }} />
                          )}
                        </div>
                        <span className={`w-16 text-xs text-right ${day.minutes > 0 ? "text-zinc-300" : "text-zinc-600"}`}>
                          {day.minutes > 0 ? day.formatted : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {weekData.by_project.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-zinc-400">Dettaglio</h3>
                  {weekData.by_project.map((proj, i) => (
                    <div key={i} className="space-y-2">
                      <div className="text-xs font-medium text-zinc-300">{proj.project_name}</div>
                      <div className="space-y-1 ml-3">
                        {proj.logs.map((log, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-500 w-14">
                              {format(parseISO(log.logged_at), "d MMM", { locale: it })}
                            </span>
                            <span className="text-zinc-300 w-12">{formatMins(log.minutes)}</span>
                            <span className="text-zinc-500 flex-1 truncate">{log.task_title}</span>
                            {log.note && <span className="text-zinc-600 truncate max-w-32">{log.note}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* REPORT MODE (month/custom): grouped items */}
          {reportData && reportData.items.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-400">
                {groupBy === "day" ? "Per giorno" : groupBy === "project" ? "Per progetto" : "Per task"}
              </h3>
              {reportData.items.map((item, i) => {
                const pct = reportData.total_minutes > 0 ? (item.minutes / reportData.total_minutes) * 100 : 0;
                const label =
                  groupBy === "day" && item.date
                    ? format(parseISO(item.date), "EEEE d MMM", { locale: it })
                    : groupBy === "project"
                      ? item.project_name || "Senza progetto"
                      : item.task_title || "—";
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300 capitalize">{label}</span>
                      <span className="text-zinc-400">{item.formatted}</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {reportData && reportData.items.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">Nessuna ora registrata nel periodo selezionato</div>
          )}
        </>
      )}
    </div>
  );
}
