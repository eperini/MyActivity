"use client";

import { useState, useEffect } from "react";
import type { Task, Project, ProjectStats, Epic, ProjectHeading } from "@/types";
import { getProject, getProjectStats, updateTask, deleteTask, getTasks, getProjectEpics, createEpic, createEpicTimeLog, deleteEpic, pushEpicToJira, getProjectHeadings, createProjectHeading, deleteProjectHeading, updateProject } from "@/lib/api";
import { useToast } from "./Toast";
import TaskItem from "./TaskItem";
import AddTaskForm from "./AddTaskForm";
import { Plus, BarChart3, Settings2, Zap, CalendarRange, Clock, ExternalLink, Trash2, X, Users, Grid2x2 } from "lucide-react";
import CustomFieldEditor from "./CustomFieldEditor";
import TimeLogForm from "./TimeLogForm";
import AutomationsView from "./AutomationsView";
import SprintBoard from "./SprintBoard";
import ProjectMembersPanel from "./ProjectMembersPanel";

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
  onSelectTask: (task: Task) => void;
  onRefresh: () => void;
}

export default function ProjectView({ projectId, onSelectTask, onRefresh }: ProjectViewProps) {
  const { showToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [headings, setHeadings] = useState<ProjectHeading[]>([]);
  const [showNewHeading, setShowNewHeading] = useState(false);
  const [newHeadingName, setNewHeadingName] = useState("");
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
        const [p, s, allTasks, ep, hd] = await Promise.all([
          getProject(projectId),
          getProjectStats(projectId),
          getTasks(),
          getProjectEpics(projectId),
          getProjectHeadings(projectId),
        ]);
        setProject(p);
        setStats(s);
        setTasks(allTasks.filter((t) => t.project_id === projectId && !t.parent_id));
        setEpics(ep);
        setHeadings(hd);
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

  async function handleCreateHeading() {
    if (!newHeadingName.trim()) return;
    try {
      const heading = await createProjectHeading(projectId, { name: newHeadingName.trim() });
      setHeadings(prev => [...prev, heading]);
      setNewHeadingName("");
      setShowNewHeading(false);
    } catch {
      showToast("Errore creazione sezione");
    }
  }

  async function handleDeleteHeading(headingId: number) {
    try {
      await deleteProjectHeading(projectId, headingId);
      setHeadings(prev => prev.filter(h => h.id !== headingId));
      // Clear heading_id from local tasks
      setTasks(prev => prev.map(t => t.heading_id === headingId ? { ...t, heading_id: null } : t));
      showToast("Sezione eliminata", "success");
    } catch {
      showToast("Errore eliminazione sezione");
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

  // Group active tasks by heading
  const ungroupedActive = activeTasks.filter(t => !t.heading_id);
  const groupedActive = headings.map(h => ({
    heading: h,
    tasks: activeTasks.filter(t => t.heading_id === h.id),
  }));

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
            data-tour="project-sprints"
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
            data-tour="project-automations"
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

        {/* Eisenhower undated toggle */}
        <label className="flex items-center gap-2 mt-2 cursor-pointer group">
          <Grid2x2 size={12} className="text-zinc-500" />
          <span className="text-[11px] text-zinc-500 group-hover:text-zinc-300 transition-colors">
            Mostra task senza data in Eisenhower
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={project.show_undated_eisenhower}
            onClick={async () => {
              const newValue = !project.show_undated_eisenhower;
              setProject({ ...project, show_undated_eisenhower: newValue });
              try {
                await updateProject(project.id, { show_undated_eisenhower: newValue } as Partial<Project>);
              } catch {
                setProject({ ...project, show_undated_eisenhower: !newValue });
                showToast("Errore aggiornamento impostazione");
              }
            }}
            className={`relative w-7 h-4 rounded-full transition-colors ${
              project.show_undated_eisenhower ? "bg-blue-600" : "bg-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                project.show_undated_eisenhower ? "translate-x-3" : ""
              }`}
            />
          </button>
        </label>

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
            data-tour="project-members-tab"
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

            {/* Ungrouped active tasks */}
            {ungroupedActive.length > 0 && (
              <div className="space-y-1">
                {ungroupedActive.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggle(task)}
                    onSelect={() => onSelectTask(task)}
                    isSelected={false}
                  />
                ))}
              </div>
            )}

            {/* Heading sections */}
            {groupedActive.map(({ heading, tasks: hTasks }) => (
              <div key={heading.id}>
                <div className="flex items-center gap-2 mt-4 mb-2 px-2">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{heading.name}</span>
                  <div className="flex-1 border-t border-zinc-800" />
                  <span className="text-[10px] text-zinc-600">{hTasks.length}</span>
                  <button onClick={() => handleDeleteHeading(heading.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="space-y-1">
                  {hTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => handleToggle(task)}
                      onSelect={() => onSelectTask(task)}
                      isSelected={false}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Add heading button */}
            {showNewHeading ? (
              <div className="flex gap-2 items-center mt-4">
                <input
                  value={newHeadingName}
                  onChange={e => setNewHeadingName(e.target.value)}
                  placeholder="Nome sezione..."
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") handleCreateHeading(); if (e.key === "Escape") { setShowNewHeading(false); setNewHeadingName(""); } }}
                  className="flex-1 bg-zinc-900 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none placeholder-zinc-600 border border-zinc-700"
                />
                <button onClick={handleCreateHeading} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs text-white">
                  Crea
                </button>
                <button onClick={() => { setShowNewHeading(false); setNewHeadingName(""); }} className="p-2 text-zinc-500 hover:text-zinc-300">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewHeading(true)}
                className="w-full flex items-center gap-2 px-3 py-2 mt-4 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors text-sm"
              >
                <Plus size={16} />
                Aggiungi sezione
              </button>
            )}

            {activeTasks.length === 0 && doneTasks.length === 0 && headings.length === 0 && (
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
                    <div className="ml-6 mr-3 mb-3 bg-zinc-800/70 rounded-xl p-4 border border-zinc-700/50">
                      <TimeLogForm
                        logDate={logDate}
                        onDateChange={setLogDate}
                        hours={logHours}
                        onHoursChange={setLogHours}
                        mins={logMins}
                        onMinsChange={setLogMins}
                        note={logNote}
                        onNoteChange={setLogNote}
                        onSave={() => handleLogEpic(epic)}
                        onCancel={() => setLogEpicId(null)}
                        saving={logSaving}
                      />
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
          defaultProjectId={projectId}
          onCreated={() => { setShowAddTask(false); onRefresh(); }}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </div>
  );
}
