"use client";

import { useState, useEffect, useMemo } from "react";
import type { Task, Sprint, SprintDetail, SprintStatus } from "@/types";
import {
  getSprints,
  createSprint,
  getSprintDetail,
  updateSprint,
  addTaskToSprint,
  removeTaskFromSprint,
} from "@/lib/api";
import { useToast } from "./Toast";
import {
  Plus,
  X,
  ChevronDown,
  Play,
  CheckCircle2,
  Target,
  Calendar,
  Loader2,
} from "lucide-react";

interface SprintBoardProps {
  projectId: number;
  allTasks: Task[];
}

const statusBadge: Record<SprintStatus, { bg: string; label: string }> = {
  planned: { bg: "bg-zinc-600/30 text-zinc-300", label: "Pianificato" },
  active: { bg: "bg-blue-500/20 text-blue-400", label: "Attivo" },
  completed: { bg: "bg-green-500/20 text-green-400", label: "Completato" },
};

const priorityDot: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-400",
  3: "bg-blue-400",
  4: "bg-zinc-500",
};

const taskStatusBadge: Record<string, string> = {
  todo: "bg-zinc-600/30 text-zinc-300",
  doing: "bg-yellow-500/20 text-yellow-400",
  done: "bg-green-500/20 text-green-400",
};

const taskStatusLabel: Record<string, string> = {
  todo: "Todo",
  doing: "In corso",
  done: "Fatto",
};

export default function SprintBoard({ projectId, allTasks }: SprintBoardProps) {
  const { showToast } = useToast();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SprintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  // New sprint form
  const [newName, setNewName] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  // Load sprints
  useEffect(() => {
    loadSprints();
  }, [projectId]);

  async function loadSprints() {
    setLoading(true);
    try {
      const data = await getSprints(projectId);
      setSprints(data);
      if (data.length > 0 && !selectedId) {
        // Select the active sprint, or the first one
        const active = data.find((s) => s.status === "active");
        setSelectedId(active?.id ?? data[0].id);
      }
    } catch {
      showToast("Errore caricamento sprint");
    } finally {
      setLoading(false);
    }
  }

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedId);
  }, [selectedId]);

  async function loadDetail(sprintId: number) {
    setDetailLoading(true);
    try {
      const d = await getSprintDetail(projectId, sprintId);
      setDetail(d);
    } catch {
      showToast("Errore caricamento dettaglio sprint");
    } finally {
      setDetailLoading(false);
    }
  }

  // Tasks available to add (not already in sprint)
  const availableTasks = useMemo(() => {
    if (!detail) return allTasks;
    const sprintTaskIds = new Set(detail.tasks.map((t) => t.id));
    return allTasks.filter((t) => !sprintTaskIds.has(t.id));
  }, [allTasks, detail]);

  async function handleCreateSprint() {
    if (!newName.trim() || !newStart || !newEnd) {
      showToast("Compila nome, data inizio e fine");
      return;
    }
    try {
      const s = await createSprint(projectId, {
        name: newName.trim(),
        goal: newGoal.trim() || null,
        start_date: newStart,
        end_date: newEnd,
      });
      setSprints((prev) => [...prev, s]);
      setSelectedId(s.id);
      setShowNewForm(false);
      setNewName("");
      setNewGoal("");
      setNewStart("");
      setNewEnd("");
      showToast("Sprint creato");
    } catch {
      showToast("Errore creazione sprint");
    }
  }

  async function handleStatusChange(newStatus: SprintStatus) {
    if (!selectedId) return;
    try {
      const updated = await updateSprint(projectId, selectedId, { status: newStatus });
      setSprints((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setDetail((prev) => (prev ? { ...prev, sprint: updated } : prev));
    } catch {
      showToast("Errore aggiornamento stato");
    }
  }

  async function handleAddTask(taskId: number) {
    if (!selectedId) return;
    try {
      await addTaskToSprint(projectId, selectedId, taskId);
      await loadDetail(selectedId);
      await loadSprints();
      setShowAddTask(false);
    } catch {
      showToast("Errore aggiunta task");
    }
  }

  async function handleRemoveTask(taskId: number) {
    if (!selectedId) return;
    try {
      await removeTaskFromSprint(projectId, selectedId, taskId);
      await loadDetail(selectedId);
      await loadSprints();
    } catch {
      showToast("Errore rimozione task");
    }
  }

  const selectedSprint = detail?.sprint;
  const metrics = detail?.metrics;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        Caricamento sprint...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sprint selector + new button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 pr-8 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            <option value="">Seleziona sprint</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({statusBadge[s.status].label})
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus size={14} />
          Nuovo sprint
        </button>
      </div>

      {/* New sprint form */}
      {showNewForm && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Nome sprint *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
            <input
              type="text"
              placeholder="Obiettivo (opzionale)"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 whitespace-nowrap">Inizio:</label>
              <input
                type="date"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 whitespace-nowrap">Fine:</label>
              <input
                type="date"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateSprint}
              className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Crea sprint
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Selected sprint detail */}
      {selectedSprint && (
        <div className="space-y-4">
          {/* Sprint header */}
          <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium text-white">{selectedSprint.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[selectedSprint.status].bg}`}>
                    {statusBadge[selectedSprint.status].label}
                  </span>
                </div>
                {selectedSprint.goal && (
                  <p className="text-xs text-zinc-400 flex items-center gap-1">
                    <Target size={12} />
                    {selectedSprint.goal}
                  </p>
                )}
                <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                  <Calendar size={12} />
                  {selectedSprint.start_date} &rarr; {selectedSprint.end_date}
                </p>
              </div>

              {/* Status controls */}
              <div className="flex items-center gap-1.5">
                {selectedSprint.status === "planned" && (
                  <button
                    onClick={() => handleStatusChange("active")}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                  >
                    <Play size={12} />
                    Avvia
                  </button>
                )}
                {selectedSprint.status === "active" && (
                  <button
                    onClick={() => handleStatusChange("completed")}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                  >
                    <CheckCircle2 size={12} />
                    Completa
                  </button>
                )}
                {selectedSprint.status === "completed" && (
                  <button
                    onClick={() => handleStatusChange("planned")}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-600/20 text-zinc-400 hover:bg-zinc-600/30 transition-colors"
                  >
                    Riapri
                  </button>
                )}
              </div>
            </div>

            {/* Metrics */}
            {metrics && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span>
                    {metrics.completed_tasks}/{metrics.total_tasks} task completati
                  </span>
                  <span>{metrics.completion_pct}%</span>
                  {metrics.days_remaining > 0 && (
                    <span>
                      {metrics.days_remaining} giorni rimanenti
                    </span>
                  )}
                  {metrics.days_remaining <= 0 && selectedSprint.status !== "completed" && (
                    <span className="text-red-400">Scaduto</span>
                  )}
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${metrics.completion_pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sprint tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs text-zinc-500 uppercase tracking-wider">Task nello sprint</h4>
              <div className="relative">
                <button
                  onClick={() => setShowAddTask(!showAddTask)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <Plus size={12} />
                  Aggiungi task
                </button>

                {/* Add task dropdown */}
                {showAddTask && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto">
                    {availableTasks.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-zinc-500 text-center">
                        Nessun task disponibile
                      </div>
                    ) : (
                      availableTasks.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleAddTask(t.id)}
                          className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/50 transition-colors flex items-center gap-2 border-b border-zinc-700/50 last:border-0"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[t.priority] || "bg-zinc-500"}`} />
                          <span className="truncate">{t.title}</span>
                          <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${taskStatusBadge[t.status] || ""}`}>
                            {taskStatusLabel[t.status] || t.status}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-6 text-zinc-500 text-sm">
                <Loader2 size={14} className="animate-spin mr-2" />
                Caricamento...
              </div>
            ) : detail && detail.tasks.length > 0 ? (
              <div className="space-y-1">
                {detail.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/30 border border-zinc-700/30 hover:border-zinc-600/50 transition-colors group"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[task.priority] || "bg-zinc-500"}`} />
                    <span className={`text-sm flex-1 ${task.status === "done" ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                      {task.title}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${taskStatusBadge[task.status] || ""}`}>
                      {taskStatusLabel[task.status] || task.status}
                    </span>
                    <button
                      onClick={() => handleRemoveTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-red-400 transition-all"
                      title="Rimuovi dallo sprint"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-500 text-xs">
                Nessun task nello sprint. Aggiungi task dal progetto.
              </div>
            )}
          </div>
        </div>
      )}

      {/* No sprints state */}
      {sprints.length === 0 && !showNewForm && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          Nessuno sprint. Crea il primo sprint per organizzare il lavoro.
        </div>
      )}
    </div>
  );
}
