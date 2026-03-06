"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  format, addDays, subDays, isToday, isSameDay, parseISO,
  startOfDay, addHours, eachHourOfInterval,
} from "date-fns";
import { it } from "date-fns/locale";
import type { Task } from "@/types";

interface DayCalendarProps {
  tasks: Task[];
  onSelectDate: (date: string) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: "#EF4444",
  2: "#F59E0B",
  3: "#EAB308",
  4: "#3B82F6",
};

export default function DayCalendar({ tasks, onSelectDate }: DayCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const dayTasks = tasks.filter(
    (t) => t.due_date && isSameDay(parseISO(t.due_date), currentDate) && t.status !== "done"
  );

  const hours = eachHourOfInterval({
    start: addHours(startOfDay(currentDate), 7),
    end: addHours(startOfDay(currentDate), 23),
  });

  const todayLabel = isToday(currentDate)
    ? "Oggi"
    : format(currentDate, "d MMMM yyyy", { locale: it });

  return (
    <div className="w-72 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">
            {format(currentDate, "MMM yyyy", { locale: it })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentDate(new Date())}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                isToday(currentDate)
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              Oggi
            </button>
            <button
              onClick={() => setCurrentDate((d) => subDays(d, 1))}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentDate((d) => addDays(d, 1))}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Day header */}
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold ${
              isToday(currentDate) ? "bg-blue-600 text-white" : "text-zinc-300"
            }`}
          >
            {format(currentDate, "d")}
          </div>
          <div>
            <div className="text-xs text-zinc-400">
              {format(currentDate, "EEEE", { locale: it })}
            </div>
            <div className="text-xs text-zinc-500">
              {dayTasks.length} task
            </div>
          </div>
        </div>
      </div>

      {/* All day tasks */}
      {dayTasks.length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-800/50 space-y-1">
          {dayTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs truncate"
              style={{
                backgroundColor: (PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[4]) + "20",
                color: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[4],
              }}
            >
              <span className="truncate">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {hours.map((hour) => {
            const now = new Date();
            const isCurrentHour =
              isToday(currentDate) &&
              now.getHours() === hour.getHours();

            return (
              <div key={hour.toISOString()} className="flex h-12 border-b border-zinc-800/30">
                <div className="w-12 text-[10px] text-zinc-600 text-right pr-2 pt-0.5 flex-shrink-0">
                  {format(hour, "HH:mm")}
                </div>
                <div className="flex-1 relative">
                  {isCurrentHour && (
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-red-500 z-10"
                      style={{
                        top: `${(now.getMinutes() / 60) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
