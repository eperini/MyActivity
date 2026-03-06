"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Trash2, X, Flame, TrendingUp, Calendar, Target } from "lucide-react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  isSameDay, isToday,
} from "date-fns";
import { it } from "date-fns/locale";
import type { Habit, HabitStats } from "@/types";
import { getHabitLogs, getHabitStats } from "@/lib/api";

interface HabitDetailProps {
  habit: Habit;
  onClose: () => void;
  onDelete: (id: number) => void;
  onToggleLog: (habitId: number, date: string) => void;
}

export default function HabitDetail({ habit, onClose, onDelete, onToggleLog }: HabitDetailProps) {
  const [viewMonth, setViewMonth] = useState(new Date());
  const [logDates, setLogDates] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<HabitStats | null>(null);

  // Load logs and stats
  useEffect(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth() + 1;
    getHabitLogs(habit.id, year, month)
      .then((logs) => setLogDates(new Set(logs.map((l) => l.log_date))))
      .catch(() => setLogDates(new Set()));
  }, [habit.id, viewMonth]);

  useEffect(() => {
    getHabitStats(habit.id)
      .then(setStats)
      .catch(() => setStats(null));
  }, [habit.id]);

  // Calendar grid
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const initial = habit.name.charAt(0).toUpperCase();

  function handleDayClick(day: Date) {
    const dayStr = format(day, "yyyy-MM-dd");
    // Optimistic update
    setLogDates((prev) => {
      const next = new Set(prev);
      if (next.has(dayStr)) next.delete(dayStr);
      else next.add(dayStr);
      return next;
    });
    onToggleLog(habit.id, dayStr);
  }

  return (
    <div className="w-80 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
          <X size={18} />
        </button>
        <button
          onClick={() => onDelete(habit.id)}
          className="text-zinc-400 hover:text-red-400 transition-colors"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Habit name */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
            style={{ backgroundColor: habit.color + "30", color: habit.color }}
          >
            {initial}
          </div>
          <h2 className="text-lg font-medium text-white">{habit.name}</h2>
        </div>

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 gap-2 px-4 py-3">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                <Calendar size={10} />
                Check-in mensili
              </div>
              <div className="text-lg font-semibold text-white">{stats.monthly_checkins}</div>
              <div className="text-[10px] text-zinc-600">Giorni</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                <TrendingUp size={10} />
                Check-in totali
              </div>
              <div className="text-lg font-semibold text-white">{stats.total_completions}</div>
              <div className="text-[10px] text-zinc-600">Giorni</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                <Target size={10} />
                Rate mensile
              </div>
              <div className="text-lg font-semibold text-white">{stats.monthly_rate}%</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
                <Flame size={10} className="text-orange-400" />
                Streak
              </div>
              <div className="text-lg font-semibold text-white">{stats.current_streak}</div>
              <div className="text-[10px] text-zinc-600">Giorni</div>
            </div>
          </div>
        )}

        {/* Calendar */}
        <div className="px-4 py-2">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setViewMonth((d) => subMonths(d, 1))}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-white">
              {format(viewMonth, "MMMM", { locale: it })}
            </span>
            <button
              onClick={() => setViewMonth((d) => addMonths(d, 1))}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
              <div key={d} className="text-center text-[10px] text-zinc-600 font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const dayStr = format(day, "yyyy-MM-dd");
              const checked = logDates.has(dayStr);
              const today = isToday(day);

              return (
                <div key={dayStr} className="flex flex-col items-center gap-0.5">
                  <span
                    className={`text-[10px] ${
                      today ? "text-blue-400 font-semibold" : inMonth ? "text-zinc-500" : "text-zinc-800"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  <button
                    onClick={() => inMonth && handleDayClick(day)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      !inMonth
                        ? "opacity-20"
                        : checked
                        ? ""
                        : "bg-zinc-800 hover:bg-zinc-700"
                    }`}
                    style={checked && inMonth ? { backgroundColor: habit.color } : {}}
                    disabled={!inMonth}
                  >
                    {checked && inMonth && <Check size={10} className="text-white" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Habit Log section */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Habit Log</h3>
          {habit.description ? (
            <p className="text-xs text-zinc-500">{habit.description}</p>
          ) : (
            <p className="text-xs text-zinc-600 italic">Nessuna nota per questo mese.</p>
          )}
        </div>
      </div>
    </div>
  );
}
