"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { Task, TaskList } from "@/types";
import TaskItem from "./TaskItem";
import AddTaskForm from "./AddTaskForm";

interface TaskListViewProps {
  title: string;
  tasks: Task[];
  lists: TaskList[];
  selectedTask: Task | null;
  defaultListId?: number;
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  onTaskCreated: () => void;
}

export default function TaskListView({
  title,
  tasks,
  lists,
  selectedTask,
  defaultListId,
  onSelectTask,
  onToggleTask,
  onTaskCreated,
}: TaskListViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const listMap = Object.fromEntries(lists.map((l) => [l.id, l]));

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <span className="text-xs text-zinc-500">{tasks.length} task</span>
      </div>

      {/* Add task button */}
      <div className="px-4 py-2 border-b border-zinc-800/50">
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-blue-400 transition-colors"
        >
          <Plus size={16} />
          <span>Aggiungi task</span>
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <p className="text-sm">Nessun task</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                list={listMap[task.list_id]}
                isSelected={selectedTask?.id === task.id}
                onSelect={onSelectTask}
                onToggle={onToggleTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add task modal */}
      {showAddForm && (
        <AddTaskForm
          lists={lists}
          defaultListId={defaultListId}
          onCreated={onTaskCreated}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}
