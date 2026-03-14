"use client";

import { Plus, Search, X, SlidersHorizontal, GripVertical } from "lucide-react";
import { useState, useMemo } from "react";
import type { Task } from "@/types";
import TaskItem from "./TaskItem";
import AddTaskForm from "./AddTaskForm";
import { reorderTasks } from "@/lib/api";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TaskListViewProps {
  title: string;
  tasks: Task[];
  selectedTask: Task | null;
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  onTaskCreated: () => void;
}

type SortOption = "priority" | "due_date" | "title" | "manual";

function SortableTaskItem({
  task,
  isSelected,
  onSelect,
  onToggle,
  isDraggable,
}: {
  task: Task;
  isSelected: boolean;
  onSelect: (task: Task) => void;
  onToggle: (task: Task) => void;
  isDraggable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {isDraggable && (
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 px-1 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none"
        >
          <GripVertical size={14} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <TaskItem
          task={task}
          isSelected={isSelected}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}

export default function TaskListView({
  title,
  tasks,
  selectedTask,
  onSelectTask,
  onToggleTask,
  onTaskCreated,
}: TaskListViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterPriority, setFilterPriority] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("due_date");

  const hasActiveFilters = searchQuery || filterPriority !== null;
  const isManualSort = sortBy === "manual";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

    // Sort
    if (sortBy === "manual") {
      result.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    } else {
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
    }

    return result;
  }, [tasks, searchQuery, filterPriority, sortBy]);

  function clearFilters() {
    setSearchQuery("");
    setFilterPriority(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredAndSorted.findIndex((t) => t.id === active.id);
    const newIndex = filteredAndSorted.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder locally
    const reordered = [...filteredAndSorted];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Persist to backend
    try {
      await reorderTasks(reordered.map((t) => t.id));
      onTaskCreated(); // triggers loadData refresh
    } catch {
      // Refresh on error
      onTaskCreated();
    }
  }

  const PRIORITY_OPTIONS = [
    { value: 1, label: "Urgente", color: "bg-red-600" },
    { value: 2, label: "Alta", color: "bg-orange-600" },
    { value: 3, label: "Media", color: "bg-yellow-600" },
    { value: 4, label: "Bassa", color: "bg-zinc-600" },
  ];

  const taskIds = filteredAndSorted.map((t) => t.id);

  return (
    <div data-tour="task-list" className="flex-1 flex flex-col h-full bg-zinc-950">
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
            data-tour="add-task-btn"
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

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-zinc-800 text-[10px] text-zinc-400 rounded px-2 py-1 outline-none"
            >
              <option value="manual">Ordina: Manuale</option>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-zinc-800/50">
                {filteredAndSorted.map((task) => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    isSelected={selectedTask?.id === task.id}
                    onSelect={onSelectTask}
                    onToggle={onToggleTask}
                    isDraggable={isManualSort}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add task modal */}
      {showAddForm && (
        <AddTaskForm
          onCreated={onTaskCreated}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}
