"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { format, addDays, startOfWeek, isToday, isSameDay } from "date-fns";
import { it } from "date-fns/locale";
import type { Habit } from "@/types";

interface HabitListViewProps {
  habits: Habit[];
  weekLogs: Record<number, string[]>;
  selectedHabit: Habit | null;
  onSelectHabit: (habit: Habit) => void;
  onToggleLog: (habitId: number, date: string) => void;
  onAddHabit: () => void;
}

export default function HabitListView({
  habits,
  weekLogs,
  selectedHabit,
  onSelectHabit,
  onToggleLog,
  onAddHabit,
}: HabitListViewProps) {
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const todayStr = format(today, "yyyy-MM-dd");

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-white">Abitudini</h1>
        <button
          onClick={onAddHabit}
          className="text-zinc-400 hover:text-blue-400 transition-colors"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Week strip */}
      <div className="flex items-center px-6 py-3 border-b border-zinc-800 gap-1">
        {weekDays.map((day) => {
          const isT = isToday(day);
          return (
            <div key={day.toISOString()} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-zinc-600 uppercase">
                {format(day, "EEE", { locale: it })}
              </span>
              <span
                className={`text-xs font-medium ${
                  isT ? "text-blue-400" : "text-zinc-400"
                }`}
              >
                {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>

      {/* Habit list */}
      <div className="flex-1 overflow-y-auto">
        {habits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <p className="text-sm">Nessuna abitudine</p>
            <button
              onClick={onAddHabit}
              className="mt-2 text-sm text-blue-400 hover:text-blue-300"
            >
              Crea la prima
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {habits.map((habit) => {
              const logs = weekLogs[habit.id] || [];
              const isSelected = selectedHabit?.id === habit.id;
              const todayChecked = logs.includes(todayStr);
              const initial = habit.name.charAt(0).toUpperCase();

              // Count total logs as "total days"
              const totalDays = logs.length;

              return (
                <div
                  key={habit.id}
                  onClick={() => onSelectHabit(habit)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-2 ${
                    isSelected
                      ? "bg-zinc-800/80 border-l-blue-500"
                      : "border-l-transparent hover:bg-zinc-800/40"
                  }`}
                >
                  {/* Icon circle */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: habit.color + "30", color: habit.color }}
                  >
                    {initial}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{habit.name}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: habit.color }} />
                        {totalDays} Days
                      </span>
                    </div>
                  </div>

                  {/* Week dots */}
                  <div className="flex items-center gap-1">
                    {weekDays.map((day) => {
                      const dayStr = format(day, "yyyy-MM-dd");
                      const checked = logs.includes(dayStr);
                      const isT = isToday(day);
                      const isPast = day < today && !isT;

                      return (
                        <button
                          key={dayStr}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLog(habit.id, dayStr);
                          }}
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                            checked
                              ? ""
                              : isT
                              ? "border-2 border-zinc-600 hover:border-zinc-400"
                              : "border border-zinc-800 hover:border-zinc-600"
                          }`}
                          style={checked ? { backgroundColor: habit.color } : {}}
                        >
                          {checked && <Check size={10} className="text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
