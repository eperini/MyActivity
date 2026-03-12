"use client";

import { Plus, Search, X, SlidersHorizontal } from "lucide-react";
import { useState, useMemo } from "react";
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

type SortOption = "priority" | "due_date" | "title";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterPriority, setFilterPriority] = useState<number | null>(null);
  const [filterList, setFilterList] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("due_date");

  const listMap = Object.fromEntries(lists.map((l) => [l.id, l]));

  const hasActiveFilters = searchQuery || filterPriority !== null || filterList !== null;

  const filteredAndSorted = useMemo(() => {
    let result = [...tasks];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Priority filter
    if (filterPriority !== null) {
      result = result.filter((t) => t.priority === filterPriority);
    }

    // List filter
    if (filterList !== null) {
      result = result.filter((t) => t.list_id === filterList);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "priority":
          return a.priority - b.priority;
        case "due_date":
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [tasks, searchQuery, filterPriority, filterList, sortBy]);

  function clearFilters() {
    setSearchQuery("");
    setFilterPriority(null);
    setFilterList(null);
  }

  const PRIORITY_OPTIONS = [
    { value: 1, label: "Urgente", color: "bg-red-600" },
    { value: 2, label: "Alta", color: "bg-orange-600" },
    { value: 3, label: "Media", color: "bg-yellow-600" },
    { value: 4, label: "Bassa", color: "bg-zinc-600" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header - hidden on mobile (MobileHeader is used) */}
      <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <span className="text-xs text-zinc-500">
          {filteredAndSorted.length}{hasActiveFilters ? `/${tasks.length}` : ""} task
        </span>
      </div>

      {/* Search + Filter bar */}
      <div className="px-4 py-2 border-b border-zinc-800/50 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-1.5">
            <Search size={14} className="text-zinc-500 flex-shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca task..."
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder-zinc-600"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? "bg-blue-600/20 text-blue-400"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="hidden md:block p-2 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Filter controls */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 pb-1">
            {/* Priority */}
            <div className="flex items-center gap-1">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setFilterPriority(filterPriority === p.value ? null : p.value)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    filterPriority === p.value
                      ? `${p.color} text-white`
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-zinc-800" />

            {/* List filter */}
            <select
              value={filterList ?? ""}
              onChange={(e) => setFilterList(e.target.value ? Number(e.target.value) : null)}
              className="bg-zinc-800 text-[10px] text-zinc-400 rounded px-2 py-1 outline-none"
            >
              <option value="">Tutte le liste</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            <div className="w-px h-5 bg-zinc-800" />

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-zinc-800 text-[10px] text-zinc-400 rounded px-2 py-1 outline-none"
            >
              <option value="priority">Ordina: Priorita</option>
              <option value="due_date">Ordina: Scadenza</option>
              <option value="title">Ordina: Nome</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-blue-400 hover:text-blue-300 ml-auto"
              >
                Pulisci filtri
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <p className="text-sm">
              {hasActiveFilters ? "Nessun risultato" : "Nessun task"}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-1 text-sm text-blue-400 hover:text-blue-300"
              >
                Pulisci filtri
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {filteredAndSorted.map((task) => (
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
