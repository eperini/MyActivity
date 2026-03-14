"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import type { Task } from "@/types";
import { formatRelativeDate, isOverdue } from "@/lib/dates";

interface KanbanViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  onUpdateTask: (id: number, data: Partial<Task>) => void;
}

const COLUMNS = [
  { id: "todo" as const, label: "Da fare", color: "border-zinc-600", bg: "bg-zinc-800/30" },
  { id: "doing" as const, label: "In corso", color: "border-blue-500", bg: "bg-blue-500/5" },
  { id: "done" as const, label: "Fatto", color: "border-green-500", bg: "bg-green-500/5" },
];

const PRIORITY_DOTS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-zinc-500",
};

export default function KanbanView({ tasks, onSelectTask, onToggleTask, onUpdateTask }: KanbanViewProps) {

  // Group by status (exclude someday tasks from kanban)
  const kanbanTasks = tasks.filter((t) => t.status !== "someday");
  const columns = COLUMNS.map((col) => ({
    ...col,
    tasks: kanbanTasks.filter((t) => t.status === col.id),
  }));

  // Drag state
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    if (dragTaskId === null) return;
    const task = tasks.find((t) => t.id === dragTaskId);
    if (task && task.status !== status) {
      onUpdateTask(task.id, { status: status as Task["status"] });
    }
    setDragTaskId(null);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-300">Kanban</h2>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full min-w-max md:min-w-0">
          {columns.map((col) => (
            <div
              key={col.id}
              className={`flex-1 min-w-[260px] md:min-w-0 flex flex-col rounded-xl border ${col.color} ${col.bg}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Column header */}
              <div className="px-3 py-2.5 border-b border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">{col.label}</span>
                  <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded-full px-2 py-0.5">
                    {col.tasks.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {col.tasks.map((task) => {
                  const overdue = task.due_date ? isOverdue(task.due_date) : false;
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => onSelectTask(task)}
                      className={`bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-700 transition-colors group ${
                        dragTaskId === task.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-zinc-700 group-hover:text-zinc-500 mt-0.5 flex-shrink-0 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-medium ${task.status === "done" ? "line-through text-zinc-500" : "text-zinc-200"}`}>
                            {task.title}
                          </div>

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOTS[task.priority] || PRIORITY_DOTS[4]}`} />

                            {task.tags && task.tags.length > 0 && task.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag.id}
                                className="px-1 py-0.5 rounded text-[9px]"
                                style={{ backgroundColor: tag.color + "20", color: tag.color }}
                              >
                                #{tag.name}
                              </span>
                            ))}

                            {task.due_date && (
                              <span className={`text-[10px] ${overdue ? "text-red-400" : "text-zinc-500"}`}>
                                {formatRelativeDate(task.due_date)}
                              </span>
                            )}
                          </div>

                          {/* Subtask progress */}
                          {(task.subtask_count ?? 0) > 0 && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${((task.subtask_done_count ?? 0) / (task.subtask_count ?? 1)) * 100}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-zinc-600">
                                {task.subtask_done_count}/{task.subtask_count}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {col.tasks.length === 0 && (
                  <div className="text-center py-8 text-zinc-700 text-xs">
                    Nessun task
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
