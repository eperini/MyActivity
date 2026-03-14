"use client";

import { Calendar, Inbox, Clock, CheckCircle2, Trash2, Plus, X, Zap, Grid2x2, Timer, MoreHorizontal, Pencil, CalendarDays, BarChart3, Settings, Columns3, FolderOpen, ChevronDown, ChevronRight, FileBarChart, Bell, RefreshCw, Star, Users, Archive, ListTodo, GripVertical } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Area, Project } from "@/types";
import { getAreas, getProjects, createArea, updateArea, deleteArea, createProject, updateProject, deleteProject, reorderAreas, getUnreadNotificationCount, getJiraConfigs, triggerJiraSync, importJiraUsers, getJiraUserMappings, mapJiraUser } from "@/lib/api";
import type { JiraUserMapping } from "@/lib/api";
import type { JiraConfig } from "@/types";
import { useToast } from "./Toast";

interface SidebarProps {
  selectedView: string;
  onSelectView: (view: string) => void;
  taskCounts: Record<string, number>;
  isOpen?: boolean;
  onClose?: () => void;
}

const NAV_ITEMS = [
  { id: "today", label: "Oggi", icon: Calendar },
  { id: "next7", label: "Prossimi 7 Giorni", icon: Clock },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "all", label: "Tutti i Task", icon: ListTodo },
  { id: "someday", label: "Prima o Poi", icon: Archive },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "habits", label: "Abitudini", icon: Zap },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "eisenhower", label: "Eisenhower", icon: Grid2x2 },
  { id: "pomodoro", label: "Pomodoro", icon: Timer },
  { id: "quicklog", label: "Quick Log", icon: Zap },
  { id: "timereport", label: "Report Ore", icon: Timer },
  { id: "reports", label: "Report", icon: FileBarChart },
  { id: "stats", label: "Statistiche", icon: BarChart3 },
  { id: "notifications", label: "Notifiche", icon: Bell },
  { id: "settings", label: "Impostazioni", icon: Settings },
];

const LIST_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

function SortableAreaWrapper({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="relative group/drag">
        <div
          className="absolute left-0 top-1 opacity-0 group-hover/drag:opacity-100 cursor-grab active:cursor-grabbing z-10 px-0.5"
          {...listeners}
        >
          <GripVertical size={10} className="text-zinc-600" />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Sidebar({ selectedView, onSelectView, taskCounts, isOpen, onClose }: SidebarProps) {
  const { showToast } = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [expandedAreas, setExpandedAreas] = useState<Set<number | null>>(new Set());
  // Area/Project CRUD state
  const [showNewArea, setShowNewArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaColor, setNewAreaColor] = useState(LIST_COLORS[4]); // purple
  const [showNewProject, setShowNewProject] = useState<number | null | false>(false); // false=hidden, null=no area, number=area_id
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(LIST_COLORS[8]); // indigo
  const [editingArea, setEditingArea] = useState<{ id: number; name: string; color: string } | null>(null);
  const [editingProject, setEditingProject] = useState<{ id: number; name: string; color: string } | null>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<{ type: "area" | "project"; id: number; x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "area" | "project"; id: number; name: string } | null>(null);
  const [jiraConfigs, setJiraConfigs] = useState<JiraConfig[]>([]);
  const [syncingJira, setSyncingJira] = useState<number | null>(null);
  const [jiraUserModal, setJiraUserModal] = useState<{ configId: number; projectName: string } | null>(null);
  const [jiraUserMappings, setJiraUserMappings] = useState<JiraUserMapping[]>([]);
  const [jiraUsersLoading, setJiraUsersLoading] = useState(false);
  const [zenoUsers, setZenoUsers] = useState<{ id: number; display_name: string; email: string }[]>([]);
  // Favorites (persisted in localStorage)
  const [favoriteNavs, setFavoriteNavs] = useState<Set<string>>(new Set());
  const [favoriteProjects, setFavoriteProjects] = useState<Set<number>>(new Set());
  const [navExpanded, setNavExpanded] = useState(true);

  // DnD sensors for area reordering
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleAreaDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = areas.findIndex((a) => a.id === active.id);
    const newIndex = areas.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(areas, oldIndex, newIndex);
    setAreas(reordered);
    try {
      await reorderAreas(reordered.map((a) => a.id));
    } catch {
      showToast("Errore riordinamento aree");
      getAreas().then(setAreas).catch(() => {});
    }
  }

  useEffect(() => {
    try {
      const navs = JSON.parse(localStorage.getItem("zeno_fav_navs") || "[]");
      const projs = JSON.parse(localStorage.getItem("zeno_fav_projects") || "[]");
      setFavoriteNavs(new Set(navs));
      setFavoriteProjects(new Set(projs));
      // Collapse nav by default when there are favorites
      if (navs.length > 0 || projs.length > 0) {
        setNavExpanded(false);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleFavNav = useCallback((id: string) => {
    setFavoriteNavs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("zeno_fav_navs", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleFavProject = useCallback((id: number) => {
    setFavoriteProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("zeno_fav_projects", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const projectContextRef = useRef<HTMLDivElement>(null);

  // Close context menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (projectContextRef.current && !projectContextRef.current.contains(e.target as Node)) {
        setProjectContextMenu(null);
      }
    }
    if (projectContextMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [projectContextMenu]);

  // Load areas and projects
  useEffect(() => {
    async function loadAreasProjects() {
      try {
        const [a, p, jc] = await Promise.all([getAreas(), getProjects(), getJiraConfigs().catch(() => [] as JiraConfig[])]);
        setAreas(a);
        setProjects(p);
        setJiraConfigs(jc);
      } catch { /* ignore */ }
    }
    loadAreasProjects();
  }, []);

  // Poll unread notification count every 30 seconds
  useEffect(() => {
    async function fetchUnread() {
      try {
        const data = await getUnreadNotificationCount();
        setUnreadNotifCount(data.unread);
      } catch { /* ignore */ }
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  function toggleArea(areaId: number | null) {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  }

  function handleNav(view: string) {
    onSelectView(view);
    onClose?.();
  }

  async function reloadAreasProjects() {
    try {
      const [a, p] = await Promise.all([getAreas(), getProjects()]);
      setAreas(a);
      setProjects(p);
    } catch { /* ignore */ }
  }

  async function handleCreateArea() {
    if (!newAreaName.trim()) return;
    try {
      await createArea({ name: newAreaName.trim(), color: newAreaColor });
      setNewAreaName("");
      setShowNewArea(false);
      reloadAreasProjects();
    } catch {
      showToast("Errore nella creazione dell'area");
    }
  }

  async function handleUpdateArea() {
    if (!editingArea || !editingArea.name.trim()) return;
    try {
      await updateArea(editingArea.id, { name: editingArea.name.trim(), color: editingArea.color });
      setEditingArea(null);
      reloadAreasProjects();
    } catch {
      showToast("Errore nella modifica dell'area");
    }
  }

  async function handleDeleteArea(id: number) {
    try {
      await deleteArea(id);
      setDeleteConfirm(null);
      reloadAreasProjects();
    } catch {
      showToast("Errore nell'eliminazione dell'area");
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    try {
      await createProject({
        name: newProjectName.trim(),
        color: newProjectColor,
        area_id: showNewProject !== false && showNewProject !== null ? showNewProject : undefined,
      } as Parameters<typeof createProject>[0]);
      setNewProjectName("");
      setShowNewProject(false);
      reloadAreasProjects();
    } catch {
      showToast("Errore nella creazione del progetto");
    }
  }

  async function handleUpdateProject() {
    if (!editingProject || !editingProject.name.trim()) return;
    try {
      await updateProject(editingProject.id, { name: editingProject.name.trim(), color: editingProject.color });
      setEditingProject(null);
      reloadAreasProjects();
    } catch {
      showToast("Errore nella modifica del progetto");
    }
  }

  async function handleDeleteProject(id: number) {
    try {
      await deleteProject(id);
      setDeleteConfirm(null);
      if (selectedView === `project-${id}`) onSelectView("inbox");
      reloadAreasProjects();
    } catch {
      showToast("Errore nell'eliminazione del progetto");
    }
  }

  function handleProjectContextMenu(e: React.MouseEvent, type: "area" | "project", id: number) {
    e.preventDefault();
    e.stopPropagation();
    setProjectContextMenu({ type, id, x: e.clientX, y: e.clientY });
  }

  const sidebarContent = (
    <aside data-tour="sidebar" className="w-full md:w-80 h-full bg-zinc-900 flex flex-col py-4 text-sm overflow-y-auto">
      {/* Favorites section */}
      {(favoriteNavs.size > 0 || favoriteProjects.size > 0) && (
        <>
          <div className="px-3 space-y-0.5">
            <div className="flex items-center px-3 mb-1">
              <Star size={12} className="text-yellow-400 mr-1.5" />
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Preferiti</span>
            </div>
            {NAV_ITEMS.filter(item => favoriteNavs.has(item.id)).map((item) => {
              const Icon = item.icon;
              const isActive = selectedView === item.id;
              const count = item.id === "notifications" ? unreadNotifCount : (taskCounts[item.id] || 0);
              const isNotifBadge = item.id === "notifications" && count > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg transition-colors group ${
                    isActive
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1 text-left text-base md:text-sm">{item.label}</span>
                  {isNotifBadge ? (
                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-medium min-w-[18px] text-center">
                      {count}
                    </span>
                  ) : count > 0 ? (
                    <span className="text-xs text-zinc-500 group-hover:hidden">{count}</span>
                  ) : null}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavNav(item.id); }}
                    className="text-yellow-400 hover:text-yellow-300 hidden group-hover:block"
                  >
                    <Star size={12} fill="currentColor" />
                  </button>
                </button>
              );
            })}
            {projects.filter(p => favoriteProjects.has(p.id)).map((project) => {
              const isActive = selectedView === `project-${project.id}`;
              return (
                <button
                  key={`fav-proj-${project.id}`}
                  onClick={() => handleNav(`project-${project.id}`)}
                  className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg transition-colors group ${
                    isActive
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <FolderOpen size={18} style={{ color: project.color || "#6366F1" }} />
                  <span className="flex-1 text-left text-base md:text-sm truncate">{project.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavProject(project.id); }}
                    className="text-yellow-400 hover:text-yellow-300 hidden group-hover:block"
                  >
                    <Star size={12} fill="currentColor" />
                  </button>
                </button>
              );
            })}
          </div>
          <div className="mx-4 my-3 border-t border-zinc-700" />
        </>
      )}

      {/* Navigation */}
      <div className="px-3">
        <button
          onClick={() => setNavExpanded(!navExpanded)}
          className="flex items-center gap-1.5 px-3 mb-1 w-full text-left"
        >
          <ChevronRight size={12} className={`text-zinc-500 transition-transform ${navExpanded ? "rotate-90" : ""}`} />
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Pagine</span>
        </button>
        {navExpanded && (
          <nav className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = selectedView === item.id;
              const isFav = favoriteNavs.has(item.id);
              const count = item.id === "notifications" ? unreadNotifCount : (taskCounts[item.id] || 0);
              const isNotifBadge = item.id === "notifications" && count > 0;
              return (
                <button
                  key={item.id}
                  data-tour={`nav-${item.id}`}
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg transition-colors group ${
                    isActive
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <Icon size={18} />
                  <span className="flex-1 text-left text-base md:text-sm">{item.label}</span>
                  {isNotifBadge ? (
                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-medium min-w-[18px] text-center">
                      {count}
                    </span>
                  ) : count > 0 ? (
                    <span className="text-xs text-zinc-500 group-hover:hidden">{count}</span>
                  ) : null}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavNav(item.id); }}
                    className={`hidden group-hover:block transition-colors ${
                      isFav ? "text-yellow-400 hover:text-yellow-300" : "text-zinc-600 hover:text-yellow-400"
                    }`}
                  >
                    <Star size={12} fill={isFav ? "currentColor" : "none"} />
                  </button>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 my-3 border-t border-zinc-700" />

      {/* Projects & Areas */}
      <div className="px-3">
        <div data-tour="sidebar-projects" className="flex items-center justify-between px-3 mb-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Progetti</span>
          <div className="flex items-center gap-1">
            <button
              data-tour="sidebar-new-area"
              onClick={() => { setShowNewArea(true); setShowNewProject(false); }}
              title="Nuova area"
              className="text-zinc-500 hover:text-blue-400 transition-colors text-[10px] font-medium px-1"
            >
              +Area
            </button>
            <button
              data-tour="sidebar-new-project"
              onClick={() => { setShowNewProject(null); setShowNewArea(false); }}
              title="Nuovo progetto"
              className="text-zinc-500 hover:text-blue-400 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* New area form */}
        {showNewArea && (
          <div className="mb-2 mx-1 p-3 bg-zinc-800 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Nome area..."
                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateArea();
                  if (e.key === "Escape") setShowNewArea(false);
                }}
              />
              <button onClick={() => setShowNewArea(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewAreaColor(color)}
                  className={`w-5 h-5 rounded-full transition-all ${
                    newAreaColor === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              onClick={handleCreateArea}
              disabled={!newAreaName.trim()}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs font-medium text-white transition-colors"
            >
              Crea area
            </button>
          </div>
        )}

        {/* New project form (without area) */}
        {showNewProject !== false && showNewProject === null && (
          <div className="mb-2 mx-1 p-3 bg-zinc-800 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Nome progetto..."
                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateProject();
                  if (e.key === "Escape") { setShowNewProject(false); setNewProjectName(""); }
                }}
              />
              <button onClick={() => { setShowNewProject(false); setNewProjectName(""); }} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewProjectColor(color)}
                  className={`w-5 h-5 rounded-full transition-all ${
                    newProjectColor === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim()}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs font-medium text-white transition-colors"
            >
              Crea progetto
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          {/* Projects without area */}
          {projects.filter((p) => !p.area_id).map((project) => {
            if (editingProject?.id === project.id) {
              return (
                <div key={`proj-${project.id}`} className="mx-1 p-2 bg-zinc-800 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={14} style={{ color: editingProject.color }} />
                    <input
                      autoFocus
                      value={editingProject.name}
                      onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                      className="flex-1 bg-transparent text-sm text-zinc-200 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateProject();
                        if (e.key === "Escape") setEditingProject(null);
                      }}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {LIST_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditingProject({ ...editingProject, color })}
                        className={`w-4 h-4 rounded-full transition-all ${
                          editingProject.color === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingProject(null)} className="flex-1 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300">Annulla</button>
                    <button onClick={handleUpdateProject} className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white">Salva</button>
                  </div>
                </div>
              );
            }
            return (
              <button
                key={`proj-${project.id}`}
                onClick={() => handleNav(`project-${project.id}`)}
                onContextMenu={(e) => handleProjectContextMenu(e, "project", project.id)}
                className={`group w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  selectedView === `project-${project.id}`
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <FolderOpen size={16} style={{ color: project.color || "#6366F1" }} />
                <span className="flex-1 text-left truncate text-sm">{project.name}</span>
                {project.task_count > 0 && (
                  <span className="text-xs text-zinc-500 group-hover:hidden">
                    {project.completed_count}/{project.task_count}
                  </span>
                )}
                <span
                  onClick={(e) => { e.stopPropagation(); toggleFavProject(project.id); }}
                  className={`hidden group-hover:block transition-colors cursor-pointer ${
                    favoriteProjects.has(project.id) ? "text-yellow-400 hover:text-yellow-300" : "text-zinc-600 hover:text-yellow-400"
                  }`}
                >
                  <Star size={12} fill={favoriteProjects.has(project.id) ? "currentColor" : "none"} />
                </span>
                <button
                  onClick={(e) => handleProjectContextMenu(e, "project", project.id)}
                  className="text-zinc-600 hover:text-zinc-300 hidden group-hover:block"
                >
                  <MoreHorizontal size={14} />
                </button>
              </button>
            );
          })}

          {/* Areas with their projects */}
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleAreaDragEnd}>
          <SortableContext items={areas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {areas.map((area) => {
            const areaProjects = projects.filter((p) => p.area_id === area.id);
            const isExpanded = expandedAreas.has(area.id);
            const isEditingThisArea = editingArea?.id === area.id;

            if (isEditingThisArea) {
              return (
                <SortableAreaWrapper key={`area-${area.id}`} id={area.id}>
                <div className="mx-1 p-2 bg-zinc-800 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: editingArea.color }} />
                    <input
                      autoFocus
                      value={editingArea.name}
                      onChange={(e) => setEditingArea({ ...editingArea, name: e.target.value })}
                      className="flex-1 bg-transparent text-sm text-zinc-200 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateArea();
                        if (e.key === "Escape") setEditingArea(null);
                      }}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {LIST_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditingArea({ ...editingArea, color })}
                        className={`w-4 h-4 rounded-full transition-all ${
                          editingArea.color === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingArea(null)} className="flex-1 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300">Annulla</button>
                    <button onClick={handleUpdateArea} className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white">Salva</button>
                  </div>
                </div>
                </SortableAreaWrapper>
              );
            }

            return (
              <SortableAreaWrapper key={`area-${area.id}`} id={area.id}>
              <div className="mt-3 first:mt-0">
                <div
                  className="group flex items-center gap-2 px-3 py-1 cursor-pointer"
                  onClick={() => toggleArea(area.id)}
                  onContextMenu={(e) => handleProjectContextMenu(e, "area", area.id)}
                >
                  {isExpanded ? <ChevronDown size={10} className="text-zinc-500" /> : <ChevronRight size={10} className="text-zinc-500" />}
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: area.color || "#6366F1" }}
                  />
                  <span className="flex-1 text-left truncate text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{area.name}</span>
                  <span className="text-[10px] text-zinc-600 group-hover:hidden">{areaProjects.length}</span>
                  <button
                    onClick={(e) => handleProjectContextMenu(e, "area", area.id)}
                    className="text-zinc-600 hover:text-zinc-300 hidden group-hover:block"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </div>
                {isExpanded && (
                  <>
                    {areaProjects.map((project) => {
                      if (editingProject?.id === project.id) {
                        return (
                          <div key={`proj-${project.id}`} className="mx-1 ml-6 p-2 bg-zinc-800 rounded-lg space-y-2">
                            <div className="flex items-center gap-2">
                              <FolderOpen size={14} style={{ color: editingProject.color }} />
                              <input
                                autoFocus
                                value={editingProject.name}
                                onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleUpdateProject();
                                  if (e.key === "Escape") setEditingProject(null);
                                }}
                              />
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              {LIST_COLORS.map((color) => (
                                <button
                                  key={color}
                                  onClick={() => setEditingProject({ ...editingProject, color })}
                                  className={`w-4 h-4 rounded-full transition-all ${
                                    editingProject.color === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                                  }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditingProject(null)} className="flex-1 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300">Annulla</button>
                              <button onClick={handleUpdateProject} className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white">Salva</button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={`proj-${project.id}`}
                          onClick={() => handleNav(`project-${project.id}`)}
                          onContextMenu={(e) => handleProjectContextMenu(e, "project", project.id)}
                          className={`group w-full flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg transition-colors ${
                            selectedView === `project-${project.id}`
                              ? "bg-zinc-800 text-white"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                          }`}
                        >
                          <FolderOpen size={14} style={{ color: project.color || area.color || "#6366F1" }} />
                          <span className="flex-1 text-left truncate text-sm">{project.name}</span>
                          {project.task_count > 0 && (
                            <span className="text-xs text-zinc-500 group-hover:hidden">
                              {project.completed_count}/{project.task_count}
                            </span>
                          )}
                          <span
                            onClick={(e) => { e.stopPropagation(); toggleFavProject(project.id); }}
                            className={`hidden group-hover:block transition-colors cursor-pointer ${
                              favoriteProjects.has(project.id) ? "text-yellow-400 hover:text-yellow-300" : "text-zinc-600 hover:text-yellow-400"
                            }`}
                          >
                            <Star size={12} fill={favoriteProjects.has(project.id) ? "currentColor" : "none"} />
                          </span>
                          <button
                            onClick={(e) => handleProjectContextMenu(e, "project", project.id)}
                            className="text-zinc-600 hover:text-zinc-300 hidden group-hover:block"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </button>
                      );
                    })}
                    {/* New project form inside area */}
                    {showNewProject !== false && showNewProject === area.id && (
                      <div className="ml-6 mx-1 p-2 bg-zinc-800 rounded-lg space-y-2 mt-1">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Nome progetto..."
                            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder-zinc-600"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCreateProject();
                              if (e.key === "Escape") { setShowNewProject(false); setNewProjectName(""); }
                            }}
                          />
                          <button onClick={() => { setShowNewProject(false); setNewProjectName(""); }} className="text-zinc-500 hover:text-zinc-300">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {LIST_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setNewProjectColor(color)}
                              className={`w-4 h-4 rounded-full transition-all ${
                                newProjectColor === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <button
                          onClick={handleCreateProject}
                          disabled={!newProjectName.trim()}
                          className="w-full py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs font-medium text-white transition-colors"
                        >
                          Crea progetto
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              </SortableAreaWrapper>
            );
          })}
          </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 my-3 border-t border-zinc-700" />

      {/* Bottom */}
      <div className="mt-auto px-3 space-y-0.5">
        <button
          onClick={() => handleNav("completed")}
          className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors ${
            selectedView === "completed" ? "bg-zinc-800 text-white" : ""
          }`}
        >
          <CheckCircle2 size={20} className="md:w-[18px] md:h-[18px]" />
          <span className="text-base md:text-sm">Completati</span>
        </button>
        <button
          onClick={() => handleNav("trash")}
          className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors ${
            selectedView === "trash" ? "bg-zinc-800 text-white" : ""
          }`}
        >
          <Trash2 size={20} className="md:w-[18px] md:h-[18px]" />
          <span className="text-base md:text-sm">Cestino</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: inline sidebar */}
      <div className="hidden md:flex md:flex-shrink-0 border-r border-zinc-800">
        {sidebarContent}
      </div>

      {/* Mobile: overlay sidebar */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          {/* Panel */}
          <div className="absolute inset-y-0 left-0 w-80 animate-slide-in">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Project/Area context menu */}
      {projectContextMenu && (
        <div
          ref={projectContextRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
          style={{ left: projectContextMenu.x, top: projectContextMenu.y }}
        >
          <button
            onClick={() => {
              if (projectContextMenu.type === "area") {
                const area = areas.find((a) => a.id === projectContextMenu.id);
                if (area) setEditingArea({ id: area.id, name: area.name, color: area.color || "#6366F1" });
              } else {
                const proj = projects.find((p) => p.id === projectContextMenu.id);
                if (proj) setEditingProject({ id: proj.id, name: proj.name, color: proj.color || "#6366F1" });
              }
              setProjectContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Pencil size={14} />
            Modifica
          </button>
          {projectContextMenu.type === "area" && (
            <button
              onClick={() => {
                setShowNewProject(projectContextMenu.id);
                setExpandedAreas((prev) => new Set(prev).add(projectContextMenu.id));
                setProjectContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              <Plus size={14} />
              Aggiungi progetto
            </button>
          )}
          {projectContextMenu.type === "project" && (
            <div className="px-3 py-2">
              <span className="text-[10px] text-zinc-500 block mb-1">Sposta in area</span>
              <select
                value={projects.find(p => p.id === projectContextMenu.id)?.area_id ?? ""}
                onChange={async (e) => {
                  const areaId = e.target.value ? Number(e.target.value) : null;
                  try {
                    await updateProject(projectContextMenu.id, { area_id: areaId } as Partial<Project>);
                    reloadAreasProjects();
                    showToast("Progetto spostato", "success");
                  } catch { showToast("Errore nello spostamento"); }
                  setProjectContextMenu(null);
                }}
                className="w-full bg-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 outline-none"
              >
                <option value="">Nessuna area</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          {projectContextMenu.type === "project" && (() => {
            const jc = jiraConfigs.find((c) => c.zeno_project_id === projectContextMenu.id);
            if (!jc) return null;
            return (
              <>
              <button
                onClick={async () => {
                  setSyncingJira(jc.id);
                  setProjectContextMenu(null);
                  try {
                    await triggerJiraSync(jc.id);
                    showToast("Sincronizzazione Jira avviata", "success");
                    // Poll sync status until done
                    const poll = setInterval(async () => {
                      try {
                        const configs = await getJiraConfigs();
                        const updated = configs.find((c) => c.id === jc.id);
                        if (updated && updated.last_sync_status !== "running") {
                          clearInterval(poll);
                          setSyncingJira(null);
                          setJiraConfigs(configs);
                          if (updated.last_sync_status === "ok") {
                            showToast("Sincronizzazione Jira terminata", "success");
                            window.location.reload();
                          } else {
                            showToast(`Errore sync: ${updated.last_sync_error || "errore sconosciuto"}`);
                          }
                        }
                      } catch {
                        clearInterval(poll);
                        setSyncingJira(null);
                      }
                    }, 2000);
                    // Safety timeout: stop polling after 60s
                    setTimeout(() => { clearInterval(poll); setSyncingJira(null); }, 60000);
                  } catch {
                    showToast("Errore nella sincronizzazione Jira");
                    setSyncingJira(null);
                  }
                }}
                disabled={syncingJira === jc.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncingJira === jc.id ? "animate-spin" : ""} />
                Sincronizza con Jira
              </button>
              <button
                onClick={async () => {
                  const proj = projects.find((p) => p.id === projectContextMenu!.id);
                  setJiraUserModal({ configId: jc.id, projectName: proj?.name || "" });
                  setProjectContextMenu(null);
                  setJiraUsersLoading(true);
                  try {
                    await importJiraUsers(jc.id);
                    const data = await getJiraUserMappings(jc.id);
                    setJiraUserMappings(data.mappings);
                    setZenoUsers(data.zeno_users);
                  } catch {
                    showToast("Errore caricamento utenti Jira");
                  } finally {
                    setJiraUsersLoading(false);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-zinc-700 transition-colors"
              >
                <Users size={14} />
                Gestisci utenti Jira
              </button>
            </>
            );
          })()}
          <button
            onClick={() => {
              const item = projectContextMenu.type === "area"
                ? areas.find((a) => a.id === projectContextMenu.id)
                : projects.find((p) => p.id === projectContextMenu.id);
              if (item) setDeleteConfirm({ type: projectContextMenu.type, id: projectContextMenu.id, name: item.name });
              setProjectContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
          >
            <Trash2 size={14} />
            Elimina
          </button>
        </div>
      )}

      {/* Delete area/project confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 max-w-sm mx-4">
            <h3 className="text-sm font-medium text-white mb-2">
              Elimina {deleteConfirm.type === "area" ? "area" : "progetto"}
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              {deleteConfirm.type === "area"
                ? `L'area "${deleteConfirm.name}" verra eliminata. I progetti al suo interno rimarranno senza area.`
                : `Il progetto "${deleteConfirm.name}" verra eliminato. I task associati rimarranno nelle loro liste.`
              }
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === "area") handleDeleteArea(deleteConfirm.id);
                  else handleDeleteProject(deleteConfirm.id);
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jira User Mapping Modal */}
      {jiraUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 max-w-lg mx-4 w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">
                Utenti Jira — {jiraUserModal.projectName}
              </h3>
              <button onClick={() => setJiraUserModal(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>
            {jiraUsersLoading ? (
              <p className="text-xs text-zinc-400">Caricamento utenti...</p>
            ) : jiraUserMappings.length === 0 ? (
              <p className="text-xs text-zinc-400">Nessun utente trovato nel progetto Jira</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-zinc-500 mb-2">
                  Associa ogni utente Jira a un utente Zeno per mantenere le assegnazioni durante il sync.
                </p>
                {jiraUserMappings.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 bg-zinc-900 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-200 truncate">{m.jira_display_name}</div>
                      {m.jira_email && <div className="text-[10px] text-zinc-500 truncate">{m.jira_email}</div>}
                    </div>
                    <span className="text-[10px] text-zinc-600">→</span>
                    <select
                      value={m.zeno_user_id ?? ""}
                      onChange={async (e) => {
                        const zenoId = e.target.value ? Number(e.target.value) : null;
                        try {
                          await mapJiraUser(jiraUserModal.configId, m.jira_account_id, zenoId);
                          setJiraUserMappings((prev) =>
                            prev.map((x) =>
                              x.id === m.id
                                ? { ...x, zeno_user_id: zenoId, zeno_user_name: zenoUsers.find((u) => u.id === zenoId)?.display_name || null }
                                : x
                            )
                          );
                          showToast("Mapping aggiornato", "success");
                        } catch {
                          showToast("Errore aggiornamento mapping");
                        }
                      }}
                      className="bg-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 outline-none min-w-[140px]"
                    >
                      <option value="">Non mappato</option>
                      {zenoUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.display_name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setJiraUserModal(null)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
