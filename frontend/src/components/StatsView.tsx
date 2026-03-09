"use client";

import { useEffect, useState } from "react";
import { getDashboardStats } from "@/lib/api";
import { useToast } from "./Toast";
import {
  CheckCircle2, AlertTriangle, Clock, TrendingUp,
  Flame, Target, Timer, BarChart3,
} from "lucide-react";

interface WeekDay {
  date: string;
  completed: number;
  created: number;
}

interface MonthStat {
  month: string;
  completed: number;
  created: number;
}

interface HabitOverview {
  id: number;
  name: string;
  color: string;
  completions_this_month: number;
  current_streak: number;
}

interface DashboardStats {
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  due_today: number;
  completion_rate: number;
  avg_daily_completed: number;
  weekly: WeekDay[];
  monthly: MonthStat[];
  habits_overview: HabitOverview[];
  total_focus_hours: number;
  focus_sessions_this_week: number;
  by_priority: Record<string, number>;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof CheckCircle2;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, secondaryKey, maxBars }: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  secondaryKey?: string;
  maxBars?: number;
}) {
  const items = maxBars ? data.slice(-maxBars) : data;
  const maxVal = Math.max(...items.map((d) => Math.max(
    (d[valueKey] as number) || 0,
    secondaryKey ? ((d[secondaryKey] as number) || 0) : 0
  )), 1);

  return (
    <div className="flex items-end gap-1.5 h-32">
      {items.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex gap-0.5 items-end h-24">
            {secondaryKey && (
              <div
                className="flex-1 bg-zinc-600 rounded-t"
                style={{ height: `${((d[secondaryKey] as number) / maxVal) * 100}%`, minHeight: (d[secondaryKey] as number) > 0 ? 4 : 0 }}
              />
            )}
            <div
              className="flex-1 bg-blue-500 rounded-t"
              style={{ height: `${((d[valueKey] as number) / maxVal) * 100}%`, minHeight: (d[valueKey] as number) > 0 ? 4 : 0 }}
            />
          </div>
          <span className="text-[10px] text-zinc-500 truncate w-full text-center">
            {String(d[labelKey]).slice(-5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StatsView() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(() => showToast("Errore nel caricamento delle statistiche")).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Caricamento statistiche...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Errore nel caricamento</div>
      </div>
    );
  }

  const priorityColors: Record<string, string> = {
    urgente: "bg-red-500",
    alta: "bg-orange-500",
    media: "bg-yellow-500",
    bassa: "bg-zinc-500",
  };
  const totalPriority = Object.values(stats.by_priority).reduce((a, b) => a + b, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <BarChart3 size={20} />
        Statistiche
      </h2>

      {/* Top cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CheckCircle2} label="Completati" value={stats.completed_tasks} sub={`${stats.completion_rate}% del totale`} color="text-green-400" />
        <StatCard icon={AlertTriangle} label="Scaduti" value={stats.overdue_tasks} sub={`${stats.due_today} in scadenza oggi`} color="text-red-400" />
        <StatCard icon={TrendingUp} label="Media giornaliera" value={stats.avg_daily_completed} sub="task completati (30gg)" color="text-blue-400" />
        <StatCard icon={Timer} label="Focus totale" value={`${stats.total_focus_hours}h`} sub={`${stats.focus_sessions_this_week} sessioni questa settimana`} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly chart */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Ultimi 7 giorni</h3>
          <div className="flex items-end gap-1.5 h-32">
            {stats.weekly.map((d, i) => {
              const maxVal = Math.max(...stats.weekly.map((w) => Math.max(w.completed, w.created)), 1);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end h-24">
                    <div
                      className="flex-1 bg-zinc-600 rounded-t transition-all"
                      style={{ height: `${(d.created / maxVal) * 100}%`, minHeight: d.created > 0 ? 4 : 0 }}
                      title={`Creati: ${d.created}`}
                    />
                    <div
                      className="flex-1 bg-green-500 rounded-t transition-all"
                      style={{ height: `${(d.completed / maxVal) * 100}%`, minHeight: d.completed > 0 ? 4 : 0 }}
                      title={`Completati: ${d.completed}`}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {DAY_LABELS[new Date(d.date).getDay() === 0 ? 6 : new Date(d.date).getDay() - 1]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-600" /> Creati</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" /> Completati</span>
          </div>
        </div>

        {/* Monthly chart */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Ultimi 6 mesi</h3>
          <div className="flex items-end gap-1.5 h-32">
            {stats.monthly.map((d, i) => {
              const maxVal = Math.max(...stats.monthly.map((m) => Math.max(m.completed, m.created)), 1);
              const label = d.month.slice(5);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end h-24">
                    <div
                      className="flex-1 bg-zinc-600 rounded-t transition-all"
                      style={{ height: `${(d.created / maxVal) * 100}%`, minHeight: d.created > 0 ? 4 : 0 }}
                      title={`Creati: ${d.created}`}
                    />
                    <div
                      className="flex-1 bg-blue-500 rounded-t transition-all"
                      style={{ height: `${(d.completed / maxVal) * 100}%`, minHeight: d.completed > 0 ? 4 : 0 }}
                      title={`Completati: ${d.completed}`}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500">{label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-600" /> Creati</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500" /> Completati</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Priority breakdown */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Task attivi per priorita</h3>
          <div className="space-y-2">
            {Object.entries(stats.by_priority).map(([label, count]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-16 capitalize">{label}</span>
                <div className="flex-1 h-5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${priorityColors[label] || "bg-zinc-500"} rounded-full transition-all`}
                    style={{ width: totalPriority > 0 ? `${(count / totalPriority) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-xs text-zinc-400 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Habits overview */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Abitudini del mese</h3>
          {stats.habits_overview.length === 0 ? (
            <div className="text-xs text-zinc-500">Nessuna abitudine attiva</div>
          ) : (
            <div className="space-y-2.5">
              {stats.habits_overview.map((h) => (
                <div key={h.id} className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />
                  <span className="flex-1 text-xs text-zinc-300 truncate">{h.name}</span>
                  <span className="text-xs text-zinc-500">{h.completions_this_month}x</span>
                  {h.current_streak > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-orange-400">
                      <Flame size={12} />
                      {h.current_streak}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
