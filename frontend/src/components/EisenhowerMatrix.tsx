"use client";

import { Check } from "lucide-react";
import type { Task, TaskList } from "@/types";
import { formatRelativeDate, isOverdue } from "@/lib/dates";
import { isToday, parseISO, differenceInDays } from "date-fns";

interface EisenhowerMatrixProps {
  tasks: Task[];
  lists: TaskList[];
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
}

interface Quadrant {
  title: string;
  color: string;
  borderColor: string;
  bgColor: string;
  dotColor: string;
  priorities: number[];
}

const QUADRANTS: Quadrant[] = [
  {
    title: "Urgente & Importante",
    color: "text-red-400",
    borderColor: "border-red-500/30",
    bgColor: "bg-red-500/5",
    dotColor: "bg-red-500",
    priorities: [1],
  },
  {
    title: "Non Urgente & Importante",
    color: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/5",
    dotColor: "bg-orange-500",
    priorities: [2],
  },
  {
    title: "Urgente & Non Importante",
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    dotColor: "bg-blue-500",
    priorities: [3],
  },
  {
    title: "Non Urgente & Non Importante",
    color: "text-zinc-400",
    borderColor: "border-zinc-700/50",
    bgColor: "bg-zinc-800/20",
    dotColor: "bg-zinc-500",
    priorities: [4],
  },
];

type TimeGroup = { label: string; tasks: Task[] };

function groupByTime(tasks: Task[]): TimeGroup[] {
  const overdue: Task[] = [];
  const today: Task[] = [];
  const next7: Task[] = [];
  const later: Task[] = [];
  const completed: Task[] = [];

  for (const task of tasks) {
    if (task.status === "done") {
      completed.push(task);
      continue;
    }
    if (!task.due_date) {
      later.push(task);
      continue;
    }
    const d = parseISO(task.due_date);
    if (isOverdue(task.due_date) && !isToday(d)) {
      overdue.push(task);
    } else if (isToday(d)) {
      today.push(task);
    } else {
      const diff = differenceInDays(d, new Date());
      if (diff <= 7) {
        next7.push(task);
      } else {
        later.push(task);
      }
    }
  }

  const groups: TimeGroup[] = [];
  if (overdue.length) groups.push({ label: "Scaduti", tasks: overdue });
  if (today.length) groups.push({ label: "Oggi", tasks: today });
  if (next7.length) groups.push({ label: "Prossimi 7 giorni", tasks: next7 });
  if (later.length) groups.push({ label: "Dopo", tasks: later });
  if (completed.length) groups.push({ label: "Completati", tasks: completed });
  return groups;
}

function QuadrantPanel({
  quadrant,
  tasks,
  lists,
  onSelectTask,
  onToggleTask,
}: {
  quadrant: Quadrant;
  tasks: Task[];
  lists: TaskList[];
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
}) {
  const listMap = Object.fromEntries(lists.map((l) => [l.id, l]));
  const groups = groupByTime(tasks);

  return (
    <div className={`flex flex-col rounded-lg border ${quadrant.borderColor} ${quadrant.bgColor} overflow-hidden`}>
      {/* Quadrant header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50">
        <span className={`w-2 h-2 rounded-full ${quadrant.dotColor}`} />
        <span className={`text-xs font-medium ${quadrant.color}`}>{quadrant.title}</span>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-zinc-700 text-xs">
            Nessun task
          </div>
        ) : (
          <div className="py-1">
            {groups.map((group) => (
              <div key={group.label}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-[10px] font-medium text-zinc-500">{group.label}</span>
                  <span className="text-[10px] text-zinc-600">{group.tasks.length}</span>
                </div>

                {/* Tasks in group */}
                {group.tasks.map((task) => {
                  const isDone = task.status === "done";
                  const list = listMap[task.list_id];
                  const overdue = task.due_date ? isOverdue(task.due_date) : false;

                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/30 cursor-pointer group"
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTask(task);
                        }}
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          isDone
                            ? "bg-zinc-600 border-zinc-600"
                            : `border-zinc-600 hover:border-zinc-400`
                        }`}
                      >
                        {isDone && <Check size={8} className="text-white" />}
                      </button>

                      {/* Title */}
                      <span
                        className={`flex-1 text-xs truncate ${
                          isDone ? "line-through text-zinc-600" : "text-zinc-300"
                        }`}
                      >
                        {task.title}
                      </span>

                      {/* List badge */}
                      {list && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0"
                          style={{
                            backgroundColor: list.color + "20",
                            color: list.color,
                          }}
                        >
                          {list.name.length > 8 ? list.name.slice(0, 8) : list.name}
                        </span>
                      )}

                      {/* Due date */}
                      {task.due_date && (
                        <span
                          className={`text-[10px] flex-shrink-0 ${
                            overdue ? "text-red-400" : "text-zinc-600"
                          }`}
                        >
                          {formatRelativeDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EisenhowerMatrix({
  tasks,
  lists,
  onSelectTask,
  onToggleTask,
}: EisenhowerMatrixProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-white">Matrice di Eisenhower</h1>
      </div>

      {/* 2x2 Grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-3 min-h-0">
        {QUADRANTS.map((q) => (
          <QuadrantPanel
            key={q.title}
            quadrant={q}
            tasks={tasks.filter((t) => q.priorities.includes(t.priority))}
            lists={lists}
            onSelectTask={onSelectTask}
            onToggleTask={onToggleTask}
          />
        ))}
      </div>
    </div>
  );
}
