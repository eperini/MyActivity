"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  isSameDay, isToday, parseISO, addWeeks, subWeeks,
  addDays,
} from "date-fns";
import { it } from "date-fns/locale";
import type { Task, TaskList } from "@/types";

interface CalendarViewProps {
  tasks: Task[];
  lists: TaskList[];
  onSelectTask: (task: Task) => void;
  onSelectDate: (date: string) => void;
  onAddTask: (date: string) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: "#EF4444",
  2: "#F59E0B",
  3: "#EAB308",
  4: "#71717A",
};

type ViewMode = "month" | "week";

export default function CalendarView({ tasks, lists, onSelectTask, onSelectDate, onAddTask }: CalendarViewProps) {
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const listMap = Object.fromEntries(lists.map((l) => [l.id, l]));

  // Navigation
  function prev() {
    if (viewMode === "month") setViewDate((d) => subMonths(d, 1));
    else setViewDate((d) => subWeeks(d, 1));
  }
  function next() {
    if (viewMode === "month") setViewDate((d) => addMonths(d, 1));
    else setViewDate((d) => addWeeks(d, 1));
  }
  function goToday() {
    setViewDate(new Date());
  }

  // Days to render
  let days: Date[];
  if (viewMode === "month") {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    days = eachDayOfInterval({ start: calStart, end: calEnd });
  } else {
    const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 });
    days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }

  // Get tasks for a day
  function getTasksForDay(day: Date): Task[] {
    return tasks.filter(
      (t) => t.due_date && isSameDay(parseISO(t.due_date), day) && t.status !== "done"
    ).sort((a, b) => a.priority - b.priority);
  }

  // Selected day details
  const selectedDayTasks = selectedDay
    ? tasks.filter((t) => t.due_date && t.due_date === selectedDay).sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        return a.priority - b.priority;
      })
    : [];

  const headerLabel = viewMode === "month"
    ? format(viewDate, "MMMM yyyy", { locale: it })
    : `${format(days[0], "d MMM", { locale: it })} - ${format(days[6], "d MMM yyyy", { locale: it })}`;

  return (
    <div className="flex-1 flex h-full bg-zinc-950">
      {/* Main calendar */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white capitalize">{headerLabel}</h1>
            <div className="flex items-center gap-1">
              <button onClick={prev} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToday}
                className="px-3 py-1 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              >
                Oggi
              </button>
              <button onClick={next} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "week" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Settimana
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "month" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Mese
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-zinc-800">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
            <div key={d} className="px-2 py-2 text-xs text-zinc-500 font-medium text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className={`flex-1 grid grid-cols-7 ${viewMode === "week" ? "" : "auto-rows-fr"} overflow-y-auto`}>
          {days.map((day) => {
            const inMonth = viewMode === "week" || isSameMonth(day, viewDate);
            const dayStr = format(day, "yyyy-MM-dd");
            const dayTasks = getTasksForDay(day);
            const today = isToday(day);
            const isSelected = selectedDay === dayStr;
            const maxShown = viewMode === "week" ? 20 : 3;
            const overflow = dayTasks.length - maxShown;

            return (
              <div
                key={dayStr}
                onClick={() => {
                  setSelectedDay(dayStr);
                  onSelectDate(dayStr);
                }}
                className={`border-b border-r border-zinc-800/50 p-1.5 cursor-pointer transition-colors min-h-0 ${
                  viewMode === "week" ? "min-h-[200px]" : ""
                } ${
                  !inMonth ? "opacity-40" : ""
                } ${
                  isSelected ? "bg-zinc-800/60" : "hover:bg-zinc-800/30"
                }`}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      today
                        ? "bg-blue-600 text-white"
                        : inMonth
                        ? "text-zinc-400"
                        : "text-zinc-700"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {inMonth && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddTask(dayStr);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-zinc-600 hover:text-blue-400 transition-all p-0.5"
                      style={{ opacity: isSelected ? 0.6 : undefined }}
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>

                {/* Tasks */}
                <div className="space-y-0.5">
                  {dayTasks.slice(0, maxShown).map((task) => {
                    const list = listMap[task.list_id];
                    return (
                      <div
                        key={task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTask(task);
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate cursor-pointer hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: (list?.color || PRIORITY_COLORS[task.priority]) + "20",
                          borderLeft: `2px solid ${list?.color || PRIORITY_COLORS[task.priority]}`,
                        }}
                      >
                        <span className="truncate text-zinc-300">{task.title}</span>
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <div className="text-[9px] text-zinc-500 px-1.5">
                      +{overflow} altri
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail sidebar */}
      {selectedDay && (
        <div className="w-72 border-l border-zinc-800 bg-zinc-900 flex flex-col">
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">
                  {format(parseISO(selectedDay), "EEEE d MMMM", { locale: it })}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {selectedDayTasks.length} task
                </div>
              </div>
              <button
                onClick={() => onAddTask(selectedDay)}
                className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-zinc-800 rounded transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {selectedDayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
                <p className="text-xs">Nessun task</p>
                <button
                  onClick={() => onAddTask(selectedDay)}
                  className="mt-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  Aggiungi task
                </button>
              </div>
            ) : (
              <div className="py-1">
                {selectedDayTasks.map((task) => {
                  const list = listMap[task.list_id];
                  const isDone = task.status === "done";
                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${isDone ? "text-zinc-600 line-through" : "text-zinc-200"}`}>
                          {task.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {list && (
                            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: list.color }} />
                              {list.name}
                            </span>
                          )}
                          {task.due_time && (
                            <span className="text-[10px] text-zinc-500">{task.due_time.slice(0, 5)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
