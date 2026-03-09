"use client";

import { Repeat } from "lucide-react";
import type { Task, TaskList } from "@/types";
import { formatRelativeDate, isOverdue } from "@/lib/dates";

interface TaskItemProps {
  task: Task;
  list?: TaskList;
  isSelected: boolean;
  onSelect: (task: Task) => void;
  onToggle: (task: Task) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: "border-red-500 bg-red-500/10",
  2: "border-orange-500 bg-orange-500/10",
  3: "border-yellow-500 bg-yellow-500/10",
  4: "border-zinc-600 bg-zinc-600/10",
};

const PRIORITY_CHECK_COLORS: Record<number, string> = {
  1: "text-red-500",
  2: "text-orange-500",
  3: "text-yellow-500",
  4: "text-zinc-500",
};

export default function TaskItem({ task, list, isSelected, onSelect, onToggle }: TaskItemProps) {
  const isDone = task.status === "done";
  const displayDate = task.has_recurrence && task.next_occurrence ? task.next_occurrence : task.due_date;
  const overdue = displayDate ? isOverdue(displayDate) : false;

  return (
    <div
      onClick={() => onSelect(task)}
      className={`group flex items-start gap-3 px-4 py-4 md:py-3 cursor-pointer transition-colors border-l-2 ${
        isSelected
          ? "bg-zinc-800/80 border-l-blue-500"
          : "border-l-transparent hover:bg-zinc-800/40"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task);
        }}
        className={`mt-0.5 w-5 h-5 md:w-[18px] md:h-[18px] rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          isDone ? "bg-zinc-600 border-zinc-600" : PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[4]
        }`}
      >
        {isDone && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="text-white">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={`text-base md:text-sm ${isDone ? "line-through text-zinc-500" : "text-zinc-200"}`}>
          {task.title}
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {list && (
            <span
              className="inline-block px-2 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: list.color + "20",
                color: list.color,
              }}
            >
              {list.name}
            </span>
          )}
          {task.tags && task.tags.length > 0 && task.tags.map(tag => (
            <span
              key={tag.id}
              className="inline-block px-1.5 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: tag.color + "20", color: tag.color }}
            >
              #{tag.name}
            </span>
          ))}
          {task.assigned_to_name && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">
              → {task.assigned_to_name}
            </span>
          )}
        </div>
        {(task.subtask_count ?? 0) > 0 && (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${((task.subtask_done_count ?? 0) / (task.subtask_count ?? 1)) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500">
              {task.subtask_done_count}/{task.subtask_count}
            </span>
          </div>
        )}
      </div>

      {/* Recurrence + Due date */}
      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
        {task.has_recurrence && (
          <Repeat size={12} className="text-blue-400" />
        )}
        {displayDate && (
          <span
            className={`text-xs ${
              overdue ? "text-red-400" : "text-zinc-500"
            }`}
          >
            {formatRelativeDate(displayDate)}
          </span>
        )}
      </div>
    </div>
  );
}
