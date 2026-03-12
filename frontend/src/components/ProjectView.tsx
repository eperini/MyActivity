"use client";

import { useState, useEffect } from "react";
import type { Task, TaskList, Project, ProjectStats } from "@/types";
import { getProject, getProjectStats, updateTask, deleteTask, getTasks } from "@/lib/api";
import { useToast } from "./Toast";
import TaskItem from "./TaskItem";
import AddTaskForm from "./AddTaskForm";
import { Plus, BarChart3 } from "lucide-react";

function findList(lists: TaskList[], listId: number) {
  return lists.find((l) => l.id === listId);
}

interface ProjectViewProps {
  projectId: number;
  lists: TaskList[];
  onSelectTask: (task: Task) => void;
  onRefresh: () => void;
}

export default function ProjectView({ projectId, lists, onSelectTask, onRefresh }: ProjectViewProps) {
  const { showToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [p, s, allTasks] = await Promise.all([
          getProject(projectId),
          getProjectStats(projectId),
          getTasks(),
        ]);
        setProject(p);
        setStats(s);
        setTasks(allTasks.filter((t) => t.project_id === projectId && !t.parent_id));
      } catch {
        showToast("Errore caricamento progetto");
      }
    }
    load();
  }, [projectId]);

  async function handleToggle(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done";
    try {
      await updateTask(task.id, { status: newStatus });
      onRefresh();
    } catch {
      showToast("Errore aggiornamento task");
    }
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        Caricamento...
      </div>
    );
  }

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  const statusColors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    on_hold: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-blue-500/20 text-blue-400",
    archived: "bg-zinc-500/20 text-zinc-400",
  };

  const statusLabels: Record<string, string> = {
    active: "Attivo",
    on_hold: "In pausa",
    completed: "Completato",
    archived: "Archiviato",
  };

  const typeLabels: Record<string, string> = {
    technical: "Tecnico",
    administrative: "Amministrativo",
    personal: "Personale",
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-semibold text-white">{project.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[project.status] || ""}`}>
            {statusLabels[project.status] || project.status}
          </span>
          <span className="text-xs text-zinc-500">{typeLabels[project.project_type] || project.project_type}</span>
        </div>
        {project.description && (
          <p className="text-sm text-zinc-400 mb-3">{project.description}</p>
        )}

        {/* Stats bar */}
        {stats && stats.total_tasks > 0 && (
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              <BarChart3 size={14} />
              <span>{stats.completion_pct}% completato</span>
            </div>
            <span>{stats.completed_tasks}/{stats.total_tasks} task</span>
            {stats.overdue_tasks > 0 && (
              <span className="text-red-400">{stats.overdue_tasks} in ritardo</span>
            )}
            {/* Progress bar */}
            <div className="flex-1 max-w-xs h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${stats.completion_pct}%` }}
              />
            </div>
          </div>
        )}

        {project.target_date && (
          <div className="text-xs text-zinc-500 mt-2">
            Scadenza: {project.target_date}
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Add task button */}
        <button
          onClick={() => setShowAddTask(true)}
          className="w-full flex items-center gap-2 px-3 py-2 mb-4 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors text-sm"
        >
          <Plus size={16} />
          Aggiungi task al progetto
        </button>

        {/* Active tasks */}
        {activeTasks.length > 0 && (
          <div className="space-y-1">
            {activeTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                list={findList(lists, task.list_id)}
                onToggle={() => handleToggle(task)}
                onSelect={() => onSelectTask(task)}
                isSelected={false}
              />
            ))}
          </div>
        )}

        {activeTasks.length === 0 && doneTasks.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">
            Nessun task in questo progetto
          </div>
        )}

        {/* Done tasks */}
        {doneTasks.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">
              Completati ({doneTasks.length})
            </h3>
            <div className="space-y-1 opacity-60">
              {doneTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  list={findList(lists, task.list_id)}
                  onToggle={() => handleToggle(task)}
                  onSelect={() => onSelectTask(task)}
                  isSelected={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add task form overlay */}
      {showAddTask && (
        <AddTaskForm
          lists={lists}
          defaultListId={lists[0]?.id}
          defaultProjectId={projectId}
          onCreated={() => { setShowAddTask(false); onRefresh(); }}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </div>
  );
}
