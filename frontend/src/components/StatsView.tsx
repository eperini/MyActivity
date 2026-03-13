"use client";

import { useEffect, useState } from "react";
import { getDashboardStats } from "@/lib/api";
import { useToast } from "./Toast";
import {
  CheckCircle2, AlertTriangle, Clock, TrendingUp,
  Flame, Target, Timer, BarChart3, Zap, FolderOpen,
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

interface HeatmapDay {
  date: string;
  count: number;
}

interface ProjectStat {
  id: number;
  name: string;
  color: string;
  task_count: number;
  completed_count: number;
}

interface DashboardStats {
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  due_today: number;
  completed_today: number;
  completed_this_week: number;
  hours_tracked_today: number;
  hours_tracked_this_week: number;
  streak_days: number;
  completion_rate: number;
  avg_daily_completed: number;
  weekly: WeekDay[];
  monthly: MonthStat[];
  heatmap: HeatmapDay[];
  by_project: ProjectStat[];
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

function ActivityHeatmap({ data }: { data: HeatmapDay[] }) {
  // Build a 53x7 grid (weeks x days)
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  function getColor(count: number) {
    if (count === 0) return "bg-zinc-800";
    const intensity = count / maxCount;
    if (intensity <= 0.25) return "bg-green-900";
    if (intensity <= 0.5) return "bg-green-700";
    if (intensity <= 0.75) return "bg-green-600";
    return "bg-green-500";
  }

  // Group by week columns (7 days per column, starting from Monday)
  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];

  // Pad start to align with weekday
  const firstDay = new Date(data[0]?.date);
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon=0
  for (let i = 0; i < startDow; i++) {
    currentWeek.push({ date: "", count: -1 });
  }

  for (const day of data) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px] min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-[11px] h-[11px] rounded-[2px] ${day.count < 0 ? "bg-transparent" : getColor(day.count)}`}
                title={day.date ? `${day.date}: ${day.count} task` : ""}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Month labels */}
      <div className="flex mt-1 text-[9px] text-zinc-600">
        {(() => {
          const labels: { label: string; offset: number }[] = [];
          let lastMonth = -1;
          weeks.forEach((week, wi) => {
            const firstValidDay = week.find((d) => d.date);
            if (firstValidDay) {
              const m = new Date(firstValidDay.date).getMonth();
              if (m !== lastMonth) {
                labels.push({ label: MONTH_LABELS[m], offset: wi });
                lastMonth = m;
              }
            }
          });
          return labels.map((l) => (
            <span key={l.offset} style={{ marginLeft: l.offset === labels[0].offset ? 0 : undefined, position: "absolute", left: l.offset * 14 }} className="relative">
              {l.label}
            </span>
          ));
        })()}
      </div>
    </div>
  );
}

function ProjectDistribution({ projects }: { projects: ProjectStat[] }) {
  if (projects.length === 0) {
    return <div className="text-xs text-zinc-500">Nessun progetto con task</div>;
  }
  const maxCount = Math.max(...projects.map((p) => p.task_count), 1);

  return (
    <div className="space-y-2.5">
      {projects.slice(0, 8).map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <span className="text-xs text-zinc-300 w-28 truncate">{p.name}</span>
          <div className="flex-1 h-5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(p.task_count / maxCount) * 100}%`,
                backgroundColor: p.color,
              }}
            />
          </div>
          <span className="text-xs text-zinc-400 w-16 text-right">
            {p.completed_count}/{p.task_count}
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
        Dashboard
      </h2>

      {/* Today overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={CheckCircle2} label="Oggi" value={stats.completed_today} sub={`${stats.completed_this_week} questa settimana`} color="text-green-400" />
        <StatCard icon={Clock} label="Ore oggi" value={`${stats.hours_tracked_today}h`} sub={`${stats.hours_tracked_this_week}h questa settimana`} color="text-cyan-400" />
        <StatCard icon={Zap} label="Streak" value={`${stats.streak_days}gg`} sub="giorni consecutivi" color="text-orange-400" />
        <StatCard icon={AlertTriangle} label="Scaduti" value={stats.overdue_tasks} sub={`${stats.due_today} in scadenza oggi`} color="text-red-400" />
        <StatCard icon={TrendingUp} label="Media/giorno" value={stats.avg_daily_completed} sub={`${stats.completion_rate}% completati`} color="text-blue-400" />
      </div>

      {/* Activity heatmap */}
      {stats.heatmap && stats.heatmap.length > 0 && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Attivita annuale</h3>
          <ActivityHeatmap data={stats.heatmap} />
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-zinc-500 justify-end">
            <span>Meno</span>
            <span className="w-[11px] h-[11px] rounded-[2px] bg-zinc-800" />
            <span className="w-[11px] h-[11px] rounded-[2px] bg-green-900" />
            <span className="w-[11px] h-[11px] rounded-[2px] bg-green-700" />
            <span className="w-[11px] h-[11px] rounded-[2px] bg-green-600" />
            <span className="w-[11px] h-[11px] rounded-[2px] bg-green-500" />
            <span>Piu</span>
          </div>
        </div>
      )}

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
        {/* Project distribution */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
            <FolderOpen size={14} />
            Task per progetto
          </h3>
          <ProjectDistribution projects={stats.by_project} />
        </div>

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        {/* Pomodoro */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
            <Timer size={14} />
            Focus
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-white">{stats.total_focus_hours}h</div>
              <div className="text-xs text-zinc-500">Focus totale</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.focus_sessions_this_week}</div>
              <div className="text-xs text-zinc-500">Sessioni questa settimana</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
