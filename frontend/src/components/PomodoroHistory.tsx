"use client";

import { useEffect, useState } from "react";
import { Timer, TrendingUp, Calendar, Flame } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { PomodoroSession, PomodoroStats } from "@/types";
import { getPomodoroSessions, getPomodoroStats } from "@/lib/api";

interface PomodoroHistoryProps {
  refreshKey: number;
}

type GroupedSessions = { date: string; sessions: PomodoroSession[] };

function groupByDate(sessions: PomodoroSession[]): GroupedSessions[] {
  const groups: Record<string, PomodoroSession[]> = {};
  for (const s of sessions) {
    const dateKey = format(parseISO(s.started_at), "yyyy-MM-dd");
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(s);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, sessions]) => ({ date, sessions }));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function PomodoroHistory({ refreshKey }: PomodoroHistoryProps) {
  const [stats, setStats] = useState<PomodoroStats | null>(null);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);

  useEffect(() => {
    getPomodoroStats().then(setStats).catch(() => {});
    getPomodoroSessions().then(setSessions).catch(() => {});
  }, [refreshKey]);

  const grouped = groupByDate(sessions);

  return (
    <div className="w-80 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-white">Overview</h2>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 p-3 border-b border-zinc-800">
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
              <Timer size={10} />
              Pomos oggi
            </div>
            <div className="text-xl font-semibold text-white">{stats.today_pomos}</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
              <Flame size={10} />
              Focus oggi
            </div>
            <div className="text-xl font-semibold text-white">
              {formatDuration(stats.today_focus_minutes)}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
              <TrendingUp size={10} />
              Pomos totali
            </div>
            <div className="text-xl font-semibold text-white">{stats.total_pomos}</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
              <Calendar size={10} />
              Focus totale
            </div>
            <div className="text-xl font-semibold text-white">
              {formatDuration(stats.total_focus_minutes)}
            </div>
          </div>
        </div>
      )}

      {/* Focus Record */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-white">Focus Record</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
            Nessuna sessione registrata
          </div>
        ) : (
          <div className="px-4 py-2 space-y-4">
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="text-xs font-medium text-zinc-400 mb-2">
                  {format(parseISO(group.date), "d MMM yyyy", { locale: it })}
                </div>
                <div className="space-y-1.5">
                  {group.sessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                        <Timer size={10} className="text-blue-400" />
                      </div>
                      <span className="text-xs text-zinc-400 flex-1">
                        {format(parseISO(s.started_at), "HH:mm")} - {format(parseISO(s.ended_at), "HH:mm")}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {formatDuration(s.duration_minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
