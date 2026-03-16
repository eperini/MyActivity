"use client";

import { useState, useEffect } from "react";
import type { Task, Project, ProjectStats, Epic, ProjectHeading, TimeLog } from "@/types";
import { getProject, getProjectStats, updateTask, deleteTask, getTasks, getProjectEpics, createEpic, createEpicTimeLog, deleteEpic, pushEpicToJira, getProjectHeadings, createProjectHeading, deleteProjectHeading, updateProject, createTimeLog, reorderTasks, getEpicTimeLogs, deleteEpicTimeLog } from "@/lib/api";
import { useToast } from "./Toast";
import TaskItem from "./TaskItem";
import AddTaskForm from "./AddTaskForm";
import { Plus, BarChart3, Settings2, Zap, CalendarRange, Clock, ExternalLink, Trash2, X, Users, Grid2x2, FolderOpen, Link, Check, Pencil, GripVertical, ChevronDown } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

function SortableProjectTaskItem({
  task,
  onToggle,
  onTimeLog,
  onSelect,
}: {
  task: Task;
  onToggle: () => void;
  onTimeLog: () => void;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 px-1 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none"
      >
        <GripVertical size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <TaskItem
          task={task}
          isSelected={false}
          onSelect={() => onSelect()}
          onToggle={() => onToggle()}
          onTimeLog={() => onTimeLog()}
        />
      </div>
    </div>
  );
}

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
  refreshKey?: number;
}

export default function ProjectView({ projectId, onSelectTask, onRefresh, refreshKey }: ProjectViewProps) {
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
  const [activeTab, setActiveTab] = useState<string>("tasks"); // "tasks" | "epics" | "members" | "link-0" | "link-1" | "link-2" | "add-link"
  const [savingLinks, setSavingLinks] = useState(false);

  // Epic inline form
  const [showNewEpic, setShowNewEpic] = useState(false);
  const [newEpicName, setNewEpicName] = useState("");
  const [epicLogsOpen, setEpicLogsOpen] = useState<number | null>(null);
  const [epicLogs, setEpicLogs] = useState<TimeLog[]>([]);
  const [epicLogsLoading, setEpicLogsLoading] = useState(false);

  const [logEpicId, setLogEpicId] = useState<number | null>(null);
  const [logHours, setLogHours] = useState(0);
  const [logMins, setLogMins] = useState(0);
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [logNote, setLogNote] = useState("");
  const [logSaving, setLogSaving] = useState(false);

  async function loadProjectData() {
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

  useEffect(() => {
    loadProjectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey]);

  const [timeLogTask, setTimeLogTask] = useState<Task | null>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = tasks.findIndex(t => t.id === active.id);
    const newIdx = tasks.findIndex(t => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    // Optimistic local reorder
    const reordered = [...tasks];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    setTasks(reordered);
    try {
      await reorderTasks(reordered.map(t => t.id));
    } catch {
      onRefresh();
    }
  }

  async function handleToggle(task: Task) {
    if (task.time_only) {
      setTimeLogTask(task);
      return;
    }
    const newStatus = task.status === "done" ? "todo" : "done";
    try {
      await updateTask(task.id, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      setStats(prev => prev ? {
        ...prev,
        completed_tasks: newStatus === "done" ? prev.completed_tasks + 1 : prev.completed_tasks - 1,
        completion_pct: Math.round(((newStatus === "done" ? prev.completed_tasks + 1 : prev.completed_tasks - 1) / prev.total_tasks) * 100),
      } : prev);
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
      // Refresh logs if open
      if (epicLogsOpen === epic.id) {
        const logs = await getEpicTimeLogs(epic.id);
        setEpicLogs(logs);
      }
    } catch {
      showToast("Errore nel salvataggio");
    } finally {
      setLogSaving(false);
    }
  }

  async function toggleEpicLogs(epicId: number) {
    if (epicLogsOpen === epicId) {
      setEpicLogsOpen(null);
      setEpicLogs([]);
      return;
    }
    setEpicLogsOpen(epicId);
    setEpicLogsLoading(true);
    try {
      const logs = await getEpicTimeLogs(epicId);
      setEpicLogs(logs);
    } catch {
      showToast("Errore caricamento log");
    } finally {
      setEpicLogsLoading(false);
    }
  }

  async function handleDeleteEpicLog(epicId: number, logId: number, minutes: number) {
    try {
      await deleteEpicTimeLog(epicId, logId);
      setEpicLogs(prev => prev.filter(l => l.id !== logId));
      setEpics(prev => prev.map(e =>
        e.id === epicId
          ? { ...e, total_logged_minutes: e.total_logged_minutes - minutes, total_logged_formatted: formatMins(e.total_logged_minutes - minutes) }
          : e
      ));
      showToast("Log eliminato", "success");
    } catch {
      showToast("Errore eliminazione log");
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

  function sortTasks(list: Task[]) {
    return [...list].sort((a, b) => {
      const aDate = a.due_date || "";
      const bDate = b.due_date || "";
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      if (aDate && bDate) return aDate.localeCompare(bDate);
      return (a.position ?? 0) - (b.position ?? 0);
    });
  }

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  // Group active tasks by heading
  const ungroupedActive = sortTasks(activeTasks.filter(t => !t.heading_id));
  const groupedActive = headings.map(h => ({
    heading: h,
    tasks: sortTasks(activeTasks.filter(t => t.heading_id === h.id)),
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
            <Zap size={12} className="text-purple-400" />
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
          {(project.drive_links || []).map((link, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(`link-${i}`)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === `link-${i}`
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <FolderOpen size={12} />
              {link.name}
            </button>
          ))}
          {(project.drive_links || []).length < 3 && (
            <button
              onClick={() => setActiveTab("add-link")}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                activeTab === "add-link"
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Aggiungi pagina web"
            >
              <Plus size={12} />
              <FolderOpen size={12} />
            </button>
          )}
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
      <div className={`flex-1 ${activeTab.startsWith("link-") || activeTab === "add-link" ? "flex flex-col overflow-hidden" : "overflow-y-auto px-6 py-4"}`}>
        {activeTab.startsWith("link-") ? (() => {
          const linkIndex = parseInt(activeTab.split("-")[1]);
          const link = (project.drive_links || [])[linkIndex];
          if (!link) return null;
          return (
            <DriveIframeView
              link={link}
              saving={savingLinks}
              onRename={async (newName) => {
                const links = [...(project.drive_links || [])];
                links[linkIndex] = { ...links[linkIndex], name: newName };
                setSavingLinks(true);
                try {
                  await updateProject(project.id, { drive_links: links } as Partial<Project>);
                  setProject({ ...project, drive_links: links });
                } catch {
                  showToast("Errore rinomina");
                } finally {
                  setSavingLinks(false);
                }
              }}
              onRemove={async () => {
                const links = (project.drive_links || []).filter((_, i) => i !== linkIndex);
                setSavingLinks(true);
                try {
                  await updateProject(project.id, { drive_links: links.length ? links : null } as Partial<Project>);
                  setProject({ ...project, drive_links: links.length ? links : null });
                  setActiveTab("tasks");
                  showToast("Pagina rimossa", "success");
                } catch {
                  showToast("Errore rimozione");
                } finally {
                  setSavingLinks(false);
                }
              }}
            />
          );
        })() : activeTab === "add-link" ? (
          <AddLinkView
            saving={savingLinks}
            onSave={async (name, url) => {
              const links = [...(project.drive_links || []), { name, url }];
              setSavingLinks(true);
              try {
                await updateProject(project.id, { drive_links: links } as Partial<Project>);
                setProject({ ...project, drive_links: links });
                setActiveTab(`link-${links.length - 1}`);
                showToast("Pagina aggiunta", "success");
              } catch {
                showToast("Errore salvataggio");
              } finally {
                setSavingLinks(false);
              }
            }}
          />
        ) : activeTab === "members" ? (
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
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleTaskDragEnd}
            >
              <SortableContext items={ungroupedActive.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {ungroupedActive.length > 0 && (
                  <div className="space-y-1">
                    {ungroupedActive.map((task) => (
                      <SortableProjectTaskItem
                        key={task.id}
                        task={task}
                        onToggle={() => handleToggle(task)}
                        onTimeLog={() => setTimeLogTask(task)}
                        onSelect={() => onSelectTask(task)}
                      />
                    ))}
                  </div>
                )}
              </SortableContext>
            </DndContext>

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
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleTaskDragEnd}
                >
                  <SortableContext items={hTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1">
                      {hTasks.map((task) => (
                        <SortableProjectTaskItem
                          key={task.id}
                          task={task}
                          onToggle={() => handleToggle(task)}
                          onTimeLog={() => setTimeLogTask(task)}
                          onSelect={() => onSelectTask(task)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
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
                    <Zap size={14} className="text-purple-400/60 flex-shrink-0" />
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
                    <button
                      onClick={() => toggleEpicLogs(epic.id)}
                      className="flex items-center gap-0.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0"
                      title="Vedi log ore"
                    >
                      {epic.total_logged_formatted}
                      <ChevronDown size={12} className={`transition-transform ${epicLogsOpen === epic.id ? "rotate-180" : ""}`} />
                    </button>
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

                  {/* Epic time logs list */}
                  {epicLogsOpen === epic.id && (
                    <div className="ml-6 mr-3 mb-3">
                      {epicLogsLoading ? (
                        <p className="text-xs text-zinc-500 py-2">Caricamento...</p>
                      ) : epicLogs.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-2">Nessun log registrato</p>
                      ) : (
                        <div className="border border-zinc-700/50 rounded-lg overflow-hidden">
                          {epicLogs.map((log) => (
                            <div key={log.id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-zinc-800/50 group/log border-b border-zinc-800/50 last:border-0">
                              <span className="text-zinc-500 w-20 flex-shrink-0">{log.logged_at}</span>
                              <span className="text-emerald-400 font-medium w-12 flex-shrink-0">{log.formatted}</span>
                              <span className="text-zinc-400 flex-1 truncate">{log.note || "—"}</span>
                              <span className="text-zinc-600 text-[10px] flex-shrink-0">{log.user_name}</span>
                              <button
                                onClick={() => handleDeleteEpicLog(epic.id, log.id, log.minutes)}
                                className="p-1 opacity-0 group-hover/log:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0"
                                title="Elimina log"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
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
          onCreated={() => { setShowAddTask(false); loadProjectData(); onRefresh(); }}
          onClose={() => setShowAddTask(false)}
        />
      )}

      {/* Time log modal for time_only tasks */}
      {timeLogTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setTimeLogTask(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-zinc-800 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-blue-400" />
              <h3 className="text-sm font-medium text-white">Registra ore</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4 truncate">{timeLogTask.title}</p>
            <TimeLogModalForm
              taskId={timeLogTask.id}
              onSaved={() => { setTimeLogTask(null); onRefresh(); }}
              onCancel={() => setTimeLogTask(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Convert a Google Drive URL to embeddable format */
function toEmbedUrl(url: string): string {
  const folderMatch = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
  const docMatch = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return `https://docs.google.com/${docMatch[1]}/d/${docMatch[2]}/preview`;
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  return url;
}

function DriveIframeView({
  link,
  saving,
  onRename,
  onRemove,
}: {
  link: { name: string; url: string };
  saving: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(link.name);
  const embedUrl = toEmbedUrl(link.url);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        {editing ? (
          <div className="flex items-center gap-1.5 flex-1">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && editName.trim()) { onRename(editName.trim()); setEditing(false); }
                if (e.key === "Escape") { setEditName(link.name); setEditing(false); }
              }}
              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-200 outline-none w-40"
            />
            <button
              onClick={() => { if (editName.trim()) { onRename(editName.trim()); setEditing(false); } }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => { setEditName(link.name); setEditing(false); }}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <FolderOpen size={14} className="text-zinc-400" />
            <span className="text-xs text-zinc-300 font-medium">{link.name}</span>
            <button
              onClick={() => { setEditName(link.name); setEditing(true); }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Rinomina"
            >
              <Pencil size={11} />
            </button>
            <span className="text-xs text-zinc-600 truncate flex-1">{link.url}</span>
          </>
        )}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 flex-shrink-0"
        >
          Apri <ExternalLink size={10} />
        </a>
        <button
          onClick={onRemove}
          disabled={saving}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <iframe
        src={embedUrl}
        className="flex-1 w-full border-0 bg-white"
        allow="autoplay"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
}

function AddLinkView({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (name: string, url: string) => void;
}) {
  const [name, setName] = useState("Drive");
  const [url, setUrl] = useState("");

  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center max-w-sm space-y-4">
        <FolderOpen size={40} className="mx-auto text-zinc-600" />
        <p className="text-sm text-zinc-400">
          Collega una pagina web a questo progetto
        </p>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome tab (es. Documenti, Appunti...)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-300 outline-none placeholder-zinc-600 focus:border-zinc-500 transition-colors"
          />
          <div className="relative">
            <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Incolla URL (Google Drive, Notion, ecc.)..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-300 outline-none placeholder-zinc-600 focus:border-zinc-500 transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && name.trim()) onSave(name.trim(), url.trim());
              }}
            />
          </div>
        </div>
        <button
          onClick={() => url.trim() && name.trim() && onSave(name.trim(), url.trim())}
          disabled={saving || !url.trim() || !name.trim()}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm text-white font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          <Check size={14} />
          Aggiungi
        </button>
        <p className="text-[11px] text-zinc-600">
          Supporta Google Drive, Docs, Sheets, Notion e qualsiasi URL. Max 3 pagine.
        </p>
      </div>
    </div>
  );
}

function TimeLogModalForm({ taskId, onSaved, onCancel }: { taskId: number; onSaved: () => void; onCancel: () => void }) {
  const { showToast } = useToast();
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(0);
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const totalMins = hours * 60 + mins;
    if (totalMins <= 0) return;
    setSaving(true);
    try {
      await createTimeLog(taskId, { minutes: totalMins, logged_at: logDate, note: note.trim() || undefined });
      showToast("Ore registrate", "success");
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TimeLogForm
      logDate={logDate}
      onDateChange={setLogDate}
      hours={hours}
      onHoursChange={setHours}
      mins={mins}
      onMinsChange={setMins}
      note={note}
      onNoteChange={setNote}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
    />
  );
}
