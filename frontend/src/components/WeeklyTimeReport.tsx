"use client";

import { useEffect, useState } from "react";
import { Clock, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { WeeklyTimeData } from "@/types";
import { getWeeklyTime } from "@/lib/api";
import { useToast } from "./Toast";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return "http://localhost:8000/api";
  return `http://${window.location.hostname}:8000/api`;
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default function WeeklyTimeReport() {
  const { showToast } = useToast();
  const [data, setData] = useState<WeeklyTimeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const d = await getWeeklyTime();
      setData(d);
    } catch (e) {
      if (e instanceof Error && e.message !== "Non autorizzato") {
        showToast("Errore caricamento report ore");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    const url = `${getApiUrl()}/time/export?fmt=csv`;
    window.open(url, "_blank");
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-zinc-500 text-sm">Caricamento...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-zinc-500 text-sm">Nessun dato disponibile</span>
      </div>
    );
  }

  const maxDayMinutes = Math.max(...(data.by_day.map((d) => d.minutes)), 1);

  // Build full week array (Mon-Sun)
  const weekStart = parseISO(data.week_start);
  const fullWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const dayData = data.by_day.find((dd) => dd.date === dateStr);
    return {
      date: dateStr,
      dayName: DAY_NAMES[i],
      dayNum: d.getDate(),
      minutes: dayData?.minutes || 0,
      formatted: dayData?.formatted || "",
    };
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock size={20} />
            Report Ore
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Settimana {format(parseISO(data.week_start), "d MMM", { locale: it })} - {format(parseISO(data.week_end), "d MMM yyyy", { locale: it })}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Total */}
      <div className="bg-zinc-800/50 rounded-xl p-4">
        <div className="text-3xl font-bold text-white">{data.total_formatted}</div>
        <div className="text-sm text-zinc-500 mt-1">Totale settimana</div>
      </div>

      {/* By project */}
      {data.by_project.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-400">Per progetto</h3>
          {data.by_project.map((proj, i) => {
            const pct = data.total_minutes > 0
              ? (proj.minutes / data.total_minutes) * 100
              : 0;
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{proj.project_name}</span>
                  <span className="text-zinc-400">{proj.formatted}</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* By day */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-400">Per giorno</h3>
        <div className="space-y-2">
          {fullWeek.map((day) => {
            const pct = maxDayMinutes > 0
              ? (day.minutes / maxDayMinutes) * 100
              : 0;
            const isToday = day.date === new Date().toISOString().split("T")[0];
            return (
              <div key={day.date} className="flex items-center gap-3">
                <span className={`w-10 text-xs ${isToday ? "text-blue-400 font-medium" : "text-zinc-500"}`}>
                  {day.dayName} {day.dayNum}
                </span>
                <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                  {day.minutes > 0 && (
                    <div
                      className="h-full bg-emerald-600 rounded transition-all"
                      style={{ width: `${pct}%` }}
                    />
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

      {/* Detailed logs per project */}
      {data.by_project.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-400">Dettaglio</h3>
          {data.by_project.map((proj, i) => (
            <div key={i} className="space-y-2">
              <div className="text-xs font-medium text-zinc-300">{proj.project_name}</div>
              <div className="space-y-1 ml-3">
                {proj.logs.map((log, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500 w-14">
                      {format(parseISO(log.logged_at), "d MMM", { locale: it })}
                    </span>
                    <span className="text-zinc-300 w-12">{Math.floor(log.minutes / 60)}h {log.minutes % 60 ? `${log.minutes % 60}m` : ""}</span>
                    <span className="text-zinc-500 flex-1 truncate">{log.task_title}</span>
                    {log.note && <span className="text-zinc-600 truncate max-w-32">{log.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
