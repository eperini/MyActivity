"use client";

import { Check } from "lucide-react";
import type { Task } from "@/types";
import { formatRelativeDate, isOverdue } from "@/lib/dates";
import { isToday, parseISO, differenceInDays } from "date-fns";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { useState, useMemo, useEffect } from "react";
import { CalendarDays } from "lucide-react";
import type { Project } from "@/types";
import { getProjects } from "@/lib/api";

interface EisenhowerMatrixProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  onUpdateTask?: (id: number, data: Partial<Task>) => void;
}

interface Quadrant {
  id: string;
  title: string;
  color: string;
  borderColor: string;
  bgColor: string;
  dotColor: string;
  priority: number;
}

const QUADRANTS: Quadrant[] = [
  {
    id: "q1",
    title: "Urgente & Importante",
    color: "text-red-400",
    borderColor: "border-red-500/30",
    bgColor: "bg-red-500/5",
    dotColor: "bg-red-500",
    priority: 1,
  },
  {
    id: "q2",
    title: "Non Urgente & Importante",
    color: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/5",
    dotColor: "bg-orange-500",
    priority: 2,
  },
  {
    id: "q3",
    title: "Urgente & Non Importante",
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    dotColor: "bg-blue-500",
    priority: 3,
  },
  {
    id: "q4",
    title: "Non Urgente & Non Importante",
    color: "text-zinc-400",
    borderColor: "border-zinc-700/50",
    bgColor: "bg-zinc-800/20",
    dotColor: "bg-zinc-500",
    priority: 4,
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

function TaskCard({
  task,
  onSelectTask,
  onToggleTask,
  isDragOverlay,
}: {
  task: Task;
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  isDragOverlay?: boolean;
}) {
  const isDone = task.status === "done";
  const overdue = task.due_date ? isOverdue(task.due_date) : false;

  return (
    <div
      onClick={() => !isDragOverlay && onSelectTask(task)}
      className={`flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/30 cursor-pointer group ${
        isDragOverlay ? "bg-zinc-800 rounded-lg shadow-lg border border-zinc-600" : ""
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!isDragOverlay) onToggleTask(task);
        }}
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          isDone
            ? "bg-zinc-600 border-zinc-600"
            : "border-zinc-600 hover:border-zinc-400"
        }`}
      >
        {isDone && <Check size={8} className="text-white" />}
      </button>
      <span
        className={`flex-1 text-xs truncate ${
          isDone ? "line-through text-zinc-600" : "text-zinc-300"
        }`}
      >
        {task.title}
      </span>
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
}

function DraggableTask({
  task,
  onSelectTask,
  onToggleTask,
}: {
  task: Task;
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, touchAction: "none" as const }
    : { touchAction: "none" as const };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-30" : ""}
    >
      <TaskCard task={task} onSelectTask={onSelectTask} onToggleTask={onToggleTask} />
    </div>
  );
}

function DroppableQuadrant({
  quadrant,
  tasks,
  onSelectTask,
  onToggleTask,
  isOver,
}: {
  quadrant: Quadrant;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: quadrant.id });
  const groups = groupByTime(tasks);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border transition-colors ${quadrant.borderColor} ${quadrant.bgColor} overflow-hidden ${
        isOver ? "ring-2 ring-blue-500/50 bg-blue-500/10" : ""
      }`}
    >
      {/* Quadrant header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50">
        <span className={`w-2 h-2 rounded-full ${quadrant.dotColor}`} />
        <span className={`text-xs font-medium ${quadrant.color}`}>{quadrant.title}</span>
        <span className="text-[10px] text-zinc-600 ml-auto">{tasks.length}</span>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-zinc-700 text-xs">
            Trascina qui i task
          </div>
        ) : (
          <div className="py-1">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-[10px] font-medium text-zinc-500">{group.label}</span>
                  <span className="text-[10px] text-zinc-600">{group.tasks.length}</span>
                </div>
                {group.tasks.map((task) => (
                  <DraggableTask
                    key={task.id}
                    task={task}
                    onSelectTask={onSelectTask}
                    onToggleTask={onToggleTask}
                  />
                ))}
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
  onSelectTask,
  onToggleTask,
  onUpdateTask,
}: EisenhowerMatrixProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [overQuadrant, setOverQuadrant] = useState<string | null>(null);
  const [maxDays, setMaxDays] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = localStorage.getItem("zeno_eisenhower_max_days");
    return saved ? Number(saved) : 0;
  });

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  // Build set of project IDs that hide undated tasks
  const hideUndatedProjectIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of projects) {
      if (!p.show_undated_eisenhower) ids.add(p.id);
    }
    return ids;
  }, [projects]);

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Filter out undated tasks from projects that hide them
    if (hideUndatedProjectIds.size > 0) {
      result = result.filter((t) => {
        if (t.due_date) return true;
        if (t.project_id && hideUndatedProjectIds.has(t.project_id)) return false;
        return true;
      });
    }

    // Filter by max days
    if (maxDays > 0) {
      const now = new Date();
      result = result.filter((t) => {
        if (!t.due_date) return true;
        const diff = differenceInDays(parseISO(t.due_date), now);
        return diff <= maxDays;
      });
    }

    return result;
  }, [tasks, maxDays, hideUndatedProjectIds]);

  function handleMaxDaysChange(value: number) {
    setMaxDays(value);
    localStorage.setItem("zeno_eisenhower_max_days", String(value));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const taskId = Number(event.active.id);
    const task = tasks.find((t) => t.id === taskId);
    if (task) setActiveTask(task);
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    setOverQuadrant(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    setOverQuadrant(null);

    if (!event.over || !onUpdateTask) return;

    const taskId = Number(event.active.id);
    const targetQuadrant = QUADRANTS.find((q) => q.id === event.over!.id);
    if (!targetQuadrant) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.priority === targetQuadrant.priority) return;

    onUpdateTask(taskId, { priority: targetQuadrant.priority });
  }

  return (
    <div data-tour="eisenhower" className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-white">Matrice di Eisenhower</h1>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-zinc-500" />
          <select
            value={maxDays}
            onChange={(e) => handleMaxDaysChange(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none"
          >
            <option value={0}>Tutti i task</option>
            <option value={7}>Prossimi 7 giorni</option>
            <option value={14}>Prossimi 14 giorni</option>
            <option value={30}>Prossimi 30 giorni</option>
            <option value={60}>Prossimi 60 giorni</option>
            <option value={90}>Prossimi 90 giorni</option>
          </select>
          {maxDays > 0 && (
            <span className="text-[10px] text-zinc-500">
              {filteredTasks.length}/{tasks.length} task
            </span>
          )}
        </div>
      </div>

      {/* 2x2 Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-2 p-3 min-h-0 overflow-y-auto pb-20 md:pb-3 md:overflow-hidden">
          {QUADRANTS.map((q) => (
            <DroppableQuadrant
              key={q.id}
              quadrant={q}
              tasks={filteredTasks.filter((t) => t.priority === q.priority)}
              onSelectTask={onSelectTask}
              onToggleTask={onToggleTask}
              isOver={overQuadrant === q.id}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <TaskCard
              task={activeTask}
              onSelectTask={() => {}}
              onToggleTask={() => {}}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
