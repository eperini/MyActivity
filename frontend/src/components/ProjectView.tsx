"use client";

import { useState, useEffect, useRef } from "react";
import type { Task, TaskList, Project, ProjectStats, Epic } from "@/types";
import { getProject, getProjectStats, updateTask, deleteTask, getTasks, getProjectEpics, createEpic, createEpicTimeLog, deleteEpic, pushEpicToJira } from "@/lib/api";
import { useToast } from "./Toast";
import TaskItem from "./TaskItem";
import AddTaskForm from "./AddTaskForm";
import { Plus, BarChart3, Settings2, Zap, CalendarRange, Clock, ExternalLink, Trash2, X, Users } from "lucide-react";
import CustomFieldEditor from "./CustomFieldEditor";
import AutomationsView from "./AutomationsView";
import SprintBoard from "./SprintBoard";
import ProjectMembersPanel from "./ProjectMembersPanel";

function findList(lists: TaskList[], listId: number) {
  return lists.find((l) => l.id === listId);
}

const STATUS_LABELS: Record<string, string> = {
  todo: "da fare",
  in_progress: "in corso",
  done: "completato",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "text-zinc-500",
  in_progress: "text-blue-400",
  done: "text-green-400",
};

function formatMins(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
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
  const [epics, setEpics] = useState<Epic[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showSprints, setShowSprints] = useState(false);
  const [activeTab, setActiveTab] = useState<"tasks" | "epics" | "members">("tasks");

  // Epic inline form
  const [showNewEpic, setShowNewEpic] = useState(false);
  const [newEpicName, setNewEpicName] = useState("");
  const [logEpicId, setLogEpicId] = useState<number | null>(null);
  const [logHours, setLogHours] = useState(0);
  const [logMins, setLogMins] = useState(0);
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [logNote, setLogNote] = useState("");
  const [logSaving, setLogSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [p, s, allTasks, ep] = await Promise.all([
          getProject(projectId),
          getProjectStats(projectId),
          getTasks(),
          getProjectEpics(projectId),
        ]);
        setProject(p);
        setStats(s);
        setTasks(allTasks.filter((t) => t.project_id === projectId && !t.parent_id));
        setEpics(ep);
      } catch {
        showToast("Errore caricamento progetto");
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleCreateEpic() {
    if (!newEpicName.trim()) return;
    try {
      const epic = await createEpic(projectId, { name: newEpicName.trim() });
      setEpics(prev => [...prev, epic]);
      setNewEpicName("");
      setShowNewEpic(false);
    } catch {
      showToast("Errore creazione epic");
    }
  }

  async function handleLogEpic(epic: Epic) {
    const totalMins = logHours * 60 + logMins;
    if (totalMins <= 0) return;
    setLogSaving(true);
    try {
      await createEpicTimeLog(epic.id, {
        minutes: totalMins,
        logged_at: logDate,
        note: logNote.trim() || undefined,
      });
      setEpics(prev => prev.map(e =>
        e.id === epic.id
          ? { ...e, total_logged_minutes: e.total_logged_minutes + totalMins, total_logged_formatted: formatMins(e.total_logged_minutes + totalMins), last_log_date: logDate }
          : e
      ));
      setLogEpicId(null);
      showToast("Ore registrate", "success");
    } catch {
      showToast("Errore nel salvataggio");
    } finally {
      setLogSaving(false);
    }
  }

  async function handleDeleteEpic(epicId: number) {
    try {
      await deleteEpic(projectId, epicId);
      setEpics(prev => prev.filter(e => e.id !== epicId));
      showToast("Epic eliminato", "success");
    } catch {
      showToast("Errore eliminazione epic");
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

  const statusLabelsProject: Record<string, string> = {
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
            {statusLabelsProject[project.status] || project.status}
          </span>
          <span className="text-xs text-zinc-500">{typeLabels[project.project_type] || project.project_type}</span>
          <div className="flex-1" />
          <button
            onClick={() => { setShowSprints(!showSprints); if (!showSprints) { setShowAutomations(false); setShowFieldEditor(false); } }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors ${
              showSprints
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
            title="Sprint"
          >
            <CalendarRange size={14} />
            <span className="hidden md:inline">Sprint</span>
          </button>
          <button
            onClick={() => { setShowAutomations(!showAutomations); if (!showAutomations) { setShowFieldEditor(false); setShowSprints(false); } }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors ${
              showAutomations
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
            title="Automazioni"
          >
            <Zap size={14} />
            <span className="hidden md:inline">Automazioni</span>
          </button>
          <button
            onClick={() => { setShowFieldEditor(!showFieldEditor); if (!showFieldEditor) { setShowAutomations(false); setShowSprints(false); } }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors ${
              showFieldEditor
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
            title="Gestisci campi custom"
          >
            <Settings2 size={14} />
            <span className="hidden md:inline">Campi</span>
          </button>
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

        {/* Tab selector */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "tasks"
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Task ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab("epics")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "epics"
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Zap size={12} className="text-yellow-400" />
            Epic ({epics.length})
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "members"
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Users size={12} />
            Membri
          </button>
        </div>
      </div>

      {/* Sprint board panel */}
      {showSprints && (
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <SprintBoard projectId={projectId} allTasks={tasks} />
        </div>
      )}

      {/* Automations panel */}
      {showAutomations && (
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <AutomationsView projectId={projectId} />
        </div>
      )}

      {/* Custom field editor */}
      {showFieldEditor && (
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <CustomFieldEditor projectId={projectId} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === "members" ? (
          <ProjectMembersPanel
            projectId={projectId}
            currentUserRole={project?.current_user_role}
            ownerId={project?.owner_id || 0}
            currentUserId={0}
          />
        ) : activeTab === "tasks" ? (
          <>
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
                    list={task.list_id ? findList(lists, task.list_id) : undefined}
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
                      list={task.list_id ? findList(lists, task.list_id) : undefined}
                      onToggle={() => handleToggle(task)}
                      onSelect={() => onSelectTask(task)}
                      isSelected={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Epic list */}
            <div className="space-y-1 mb-4">
              {epics.map(epic => (
                <div key={epic.id}>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/50 group transition-colors">
                    <Zap size={14} className="text-yellow-400/60 flex-shrink-0" />
                    <span className="text-sm text-zinc-200 flex-1 truncate">{epic.name}</span>
                    {epic.jira_issue_key ? (
                      <a
                        href={epic.jira_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-zinc-500 font-mono hover:text-blue-400 flex items-center gap-0.5"
                      >
                        {epic.jira_issue_key}
                        <ExternalLink size={8} />
                      </a>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            const updated = await pushEpicToJira(projectId, epic.id);
                            setEpics(prev => prev.map(e => e.id === epic.id ? updated : e));
                            showToast("Epic pushato su Jira", "success");
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : "Errore push Jira");
                          }
                        }}
                        className="text-[10px] text-zinc-600 hover:text-blue-400 transition-colors"
                        title="Crea su Jira"
                      >
                        Push Jira
                      </button>
                    )}
                    <span className="text-xs text-zinc-400 w-16 text-right flex-shrink-0">
                      {epic.total_logged_formatted}
                    </span>
                    <span className={`text-[10px] ${STATUS_COLORS[epic.status]} flex-shrink-0`}>
                      {STATUS_LABELS[epic.status] || epic.status}
                    </span>
                    <button
                      onClick={() => {
                        if (logEpicId === epic.id) {
                          setLogEpicId(null);
                        } else {
                          setLogEpicId(epic.id);
                          setLogHours(0);
                          setLogMins(0);
                          setLogDate(new Date().toISOString().split("T")[0]);
                          setLogNote("");
                        }
                      }}
                      className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"
                      title="Log ore"
                    >
                      <Clock size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteEpic(epic.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Inline log form */}
                  {logEpicId === epic.id && (
                    <div className="ml-8 mr-3 mb-2 bg-zinc-800/70 rounded-lg p-3 space-y-2 border border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={logDate}
                          onChange={e => setLogDate(e.target.value)}
                          className="bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none"
                        />
                        <input
                          type="number"
                          min={0} max={23}
                          value={logHours}
                          onChange={e => setLogHours(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-12 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none text-center"
                        />
                        <span className="text-xs text-zinc-500">h</span>
                        <input
                          type="number"
                          min={0} max={59}
                          value={logMins}
                          onChange={e => setLogMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          className="w-12 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none text-center"
                        />
                        <span className="text-xs text-zinc-500">m</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[{ l: "15m", h: 0, m: 15 }, { l: "30m", h: 0, m: 30 }, { l: "1h", h: 1, m: 0 }, { l: "2h", h: 2, m: 0 }].map(s => (
                          <button
                            key={s.l}
                            onClick={() => { setLogHours(s.h); setLogMins(s.m); }}
                            className="px-2 py-0.5 bg-zinc-700/50 hover:bg-zinc-700 rounded text-[10px] text-zinc-400 transition-colors"
                          >
                            {s.l}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={logNote}
                          onChange={e => setLogNote(e.target.value)}
                          placeholder="Nota..."
                          className="flex-1 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none placeholder-zinc-600"
                          onKeyDown={e => { if (e.key === "Enter") handleLogEpic(epic); if (e.key === "Escape") setLogEpicId(null); }}
                        />
                        <button
                          onClick={() => handleLogEpic(epic)}
                          disabled={logSaving || (logHours * 60 + logMins <= 0)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs text-white transition-colors"
                        >
                          Salva
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {epics.length === 0 && (
              <div className="text-center py-8 text-zinc-500 text-sm">
                Nessun epic in questo progetto
              </div>
            )}

            {/* New epic form */}
            {showNewEpic ? (
              <div className="flex gap-2 items-center">
                <input
                  value={newEpicName}
                  onChange={e => setNewEpicName(e.target.value)}
                  placeholder="Nome epic..."
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") handleCreateEpic(); if (e.key === "Escape") { setShowNewEpic(false); setNewEpicName(""); } }}
                  className="flex-1 bg-zinc-900 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none placeholder-zinc-600 border border-zinc-700"
                />
                <button onClick={handleCreateEpic} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs text-white">
                  Crea
                </button>
                <button onClick={() => { setShowNewEpic(false); setNewEpicName(""); }} className="p-2 text-zinc-500 hover:text-zinc-300">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewEpic(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors text-sm"
              >
                <Plus size={16} />
                Nuovo Epic
              </button>
            )}
          </>
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
