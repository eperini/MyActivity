"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Task, Habit } from "@/types";
import {
  getTasks, updateTask, deleteTask,
  getHabits, getWeekLogs, toggleHabitLog, deleteHabit, logout,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import useIsMobile from "@/hooks/useIsMobile";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import Sidebar from "@/components/Sidebar";
import TaskListView from "@/components/TaskListView";
import TaskDetail from "@/components/TaskDetail";
import DayCalendar from "@/components/DayCalendar";
import HabitListView from "@/components/HabitListView";
import HabitDetail from "@/components/HabitDetail";
import AddHabitForm from "@/components/AddHabitForm";
import AddTaskForm from "@/components/AddTaskForm";
import EisenhowerMatrix from "@/components/EisenhowerMatrix";
import PomodoroTimer from "@/components/PomodoroTimer";
import PomodoroHistory from "@/components/PomodoroHistory";
import CalendarView from "@/components/CalendarView";
import StatsView from "@/components/StatsView";
import SettingsView from "@/components/SettingsView";
import KanbanView from "@/components/KanbanView";
import WeeklyTimeReport from "@/components/WeeklyTimeReport";
import ReportsView from "@/components/ReportsView";
import ProjectView from "@/components/ProjectView";
import QuickLogView from "@/components/QuickLogView";
import NotificationsPanel from "@/components/NotificationsPanel";
import BottomTabBar from "@/components/BottomTabBar";
import MobileHeader from "@/components/MobileHeader";
import FloatingAddButton from "@/components/FloatingAddButton";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import { isToday, parseISO, differenceInDays } from "date-fns";

export default function HomePage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedView, setSelectedView] = useState("inbox");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Mobile add task
  const [showMobileAdd, setShowMobileAdd] = useState(false);

  // Habits state
  const [habits, setHabits] = useState<Habit[]>([]);
  const [weekLogs, setWeekLogs] = useState<Record<number, string[]>>({});
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [pomodoroRefreshKey, setPomodoroRefreshKey] = useState(0);

  // Calendar add task
  const [calendarAddDate, setCalendarAddDate] = useState<string | null>(null);

  // Keyboard shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const t = await getTasks();
      setTasks(t);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadHabits = useCallback(async () => {
    try {
      const [h, wl] = await Promise.all([getHabits(), getWeekLogs()]);
      setHabits(h);
      setWeekLogs(wl);
    } catch {
      showToast("Errore nel caricamento delle abitudini");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load habits when switching to habits view
  useEffect(() => {
    if (selectedView === "habits") {
      loadHabits();
    }
  }, [selectedView, loadHabits]);

  // Clear task selection when switching views
  function handleSelectView(view: string) {
    setSelectedView(view);
    if (view === "habits") {
      setSelectedTask(null);
    } else {
      setSelectedHabit(null);
    }
    if (view !== "calendar") {
      setCalendarAddDate(null);
    }
  }

  // Effective date for a task (next_occurrence for recurring, due_date otherwise)
  function effectiveDate(task: Task): string | null {
    return task.has_recurrence && task.next_occurrence ? task.next_occurrence : task.due_date;
  }

  // Filter tasks based on selected view
  const filteredTasks = tasks.filter((task) => {
    if (task.status === "someday" && selectedView !== "someday") return false;
    if (task.status === "done" && selectedView !== "completed") return false;

    switch (selectedView) {
      case "today": {
        const sd = task.start_date;
        const dd = effectiveDate(task);
        const today = new Date();
        const startOk = sd && differenceInDays(parseISO(sd), today) <= 0;
        const dueOk = dd && differenceInDays(parseISO(dd), today) <= 0;
        return startOk || dueOk;
      }
      case "next7": {
        const sd = task.start_date;
        const dd = effectiveDate(task);
        const today = new Date();
        const startOk = sd && differenceInDays(parseISO(sd), today) <= 7;
        const dueOk = dd && differenceInDays(parseISO(dd), today) <= 7;
        return startOk || dueOk;
      }
      case "inbox":
        return task.status !== "done" && task.status !== "someday";
      case "completed":
        return task.status === "done";
      case "someday":
        return task.status === "someday";
      default:
        return true;
    }
  });

  // Count tasks per view
  const activeTasks = tasks.filter((t) => t.status !== "done" && t.status !== "someday");
  const taskCounts: Record<string, number> = {
    today: activeTasks.filter((t) => {
      const sd = t.start_date;
      const dd = effectiveDate(t);
      const today = new Date();
      const startOk = sd && differenceInDays(parseISO(sd), today) <= 0;
      const dueOk = dd && differenceInDays(parseISO(dd), today) <= 0;
      return startOk || dueOk;
    }).length,
    next7: activeTasks.filter((t) => {
      const sd = t.start_date;
      const dd = effectiveDate(t);
      const today = new Date();
      const startOk = sd && differenceInDays(parseISO(sd), today) <= 7;
      const dueOk = dd && differenceInDays(parseISO(dd), today) <= 7;
      return startOk || dueOk;
    }).length,
    inbox: activeTasks.length,
    someday: tasks.filter((t) => t.status === "someday").length,
    habits: habits.length,
  };

  // View title
  const viewTitles: Record<string, string> = {
    today: "Oggi",
    next7: "Prossimi 7 Giorni",
    inbox: "Inbox",
    completed: "Completati",
    someday: "Prima o Poi",
    calendar: "Calendario",
    habits: "Abitudini",
    eisenhower: "Eisenhower",
    pomodoro: "Pomodoro",
    stats: "Statistiche",
    settings: "Impostazioni",
    kanban: "Kanban",
    timereport: "Report Ore",
    reports: "Report",
    quicklog: "Quick Log",
  };
  const viewTitle = selectedView.startsWith("project-")
    ? "Progetto"
    : viewTitles[selectedView] || "Task";

  async function handleToggle(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done";
    try {
      await updateTask(task.id, { status: newStatus });
      if (selectedTask?.id === task.id) {
        setSelectedTask({ ...task, status: newStatus as Task["status"] });
      }
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore aggiornamento task");
      loadData();
    }
  }

  async function handleUpdate(id: number, data: Partial<Task>) {
    try {
      const updated = await updateTask(id, data);
      if (selectedTask?.id === id) {
        setSelectedTask(updated);
      }
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore aggiornamento task");
      loadData();
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id);
      setSelectedTask(null);
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore eliminazione task");
      loadData();
    }
  }

  async function handleToggleHabitLog(habitId: number, dateStr: string) {
    const prevLogs = { ...weekLogs };
    setWeekLogs((prev) => {
      const logs = prev[habitId] || [];
      const next = logs.includes(dateStr)
        ? logs.filter((d) => d !== dateStr)
        : [...logs, dateStr];
      return { ...prev, [habitId]: next };
    });
    try {
      await toggleHabitLog(habitId, dateStr);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore toggle abitudine");
      setWeekLogs(prevLogs);
    }
  }

  async function handleDeleteHabit(id: number) {
    try {
      await deleteHabit(id);
      setSelectedHabit(null);
      loadHabits();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore eliminazione abitudine");
      loadHabits();
    }
  }

  // Should show FAB?
  const showFab = ["inbox", "today", "next7", "completed", "habits", "someday"].includes(selectedView) || selectedView.startsWith("project-");

  // Keyboard shortcuts
  const shortcutActions = useMemo(
    () => ({
      onNewTask: () => {
        if (selectedView === "habits") setShowAddHabit(true);
        else setShowMobileAdd(true);
      },
      onClosePanel: () => {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showMobileAdd) { setShowMobileAdd(false); return; }
        if (showAddHabit) { setShowAddHabit(false); return; }
        if (calendarAddDate) { setCalendarAddDate(null); return; }
        if (selectedTask) { setSelectedTask(null); return; }
        if (selectedHabit) { setSelectedHabit(null); return; }
      },
      onToggleSidebar: () => setSidebarOpen((o) => !o),
      onNavigate: (view: string) => handleSelectView(view),
      onToggleSelectedTask: () => {
        if (selectedTask) handleToggle(selectedTask);
      },
      onShowHelp: () => setShowShortcuts(true),
      onSearch: () => {
        // Focus the search input in TaskListView if visible
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Cerca"]'
        );
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      onNextTask: () => {
        const idx = filteredTasks.findIndex((t) => t.id === selectedTask?.id);
        const next = filteredTasks[idx + 1] || filteredTasks[0];
        if (next) setSelectedTask(next);
      },
      onPrevTask: () => {
        const idx = filteredTasks.findIndex((t) => t.id === selectedTask?.id);
        const prev = filteredTasks[idx - 1] || filteredTasks[filteredTasks.length - 1];
        if (prev) setSelectedTask(prev);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedView, selectedTask, selectedHabit, showMobileAdd, showAddHabit, showShortcuts, calendarAddDate, filteredTasks]
  );
  useKeyboardShortcuts(shortcutActions);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Caricamento...</div>
      </div>
    );
  }

  const isHabitsView = selectedView === "habits";
  const isEisenhowerView = selectedView === "eisenhower";
  const isCalendarView = selectedView === "calendar";
  const isStatsView = selectedView === "stats";
  const isSettingsView = selectedView === "settings";
  const isKanbanView = selectedView === "kanban";
  const isTimeReportView = selectedView === "timereport";
  const isReportsView = selectedView === "reports";
  const isQuickLogView = selectedView === "quicklog";
  const isNotificationsView = selectedView === "notifications";
  const isProjectView = selectedView.startsWith("project-");

  // Check if current view is a task list view (needs TaskDetail)
  const isTaskListView = !isHabitsView && !isEisenhowerView && !isCalendarView && !isStatsView && !isSettingsView && !isKanbanView && !isTimeReportView && !isReportsView && !isQuickLogView && !isNotificationsView && !isProjectView && selectedView !== "pomodoro";

  function renderMainContent() {
    if (isStatsView) {
      return <StatsView />;
    }

    if (isSettingsView) {
      return <SettingsView onLogout={() => router.push("/login")} />;
    }

    if (isHabitsView) {
      return (
        <>
          <HabitListView
            habits={habits}
            weekLogs={weekLogs}
            selectedHabit={selectedHabit}
            onSelectHabit={setSelectedHabit}
            onToggleLog={handleToggleHabitLog}
            onAddHabit={() => setShowAddHabit(true)}
          />
          {/* Desktop only: side panel */}
          {!isMobile && (
            selectedHabit ? (
              <HabitDetail
                habit={selectedHabit}
                onClose={() => setSelectedHabit(null)}
                onDelete={handleDeleteHabit}
                onToggleLog={handleToggleHabitLog}
              />
            ) : (
              <DayCalendar tasks={tasks} onSelectDate={() => {}} />
            )
          )}
          {showAddHabit && (
            <AddHabitForm
              onCreated={() => { loadHabits(); setShowAddHabit(false); }}
              onClose={() => setShowAddHabit(false)}
            />
          )}
        </>
      );
    }

    if (selectedView === "pomodoro") {
      return (
        <>
          <PomodoroTimer
            onSessionComplete={() => setPomodoroRefreshKey((k) => k + 1)}
          />
          {!isMobile && <PomodoroHistory refreshKey={pomodoroRefreshKey} />}
        </>
      );
    }

    if (isTimeReportView) {
      return <WeeklyTimeReport />;
    }

    if (isQuickLogView) {
      return <QuickLogView />;
    }

    if (isNotificationsView) {
      return <NotificationsPanel open={true} onClose={() => setSelectedView("today")} />;
    }

    if (isReportsView) {
      return <ReportsView />;
    }

    if (isKanbanView) {
      return (
        <>
          <KanbanView
            tasks={tasks}
            onSelectTask={(task) => setSelectedTask(task)}
            onToggleTask={handleToggle}
            onUpdateTask={handleUpdate}
          />
          {/* Desktop: TaskDetail side panel */}
          {!isMobile && selectedTask && (
            <TaskDetail
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onRefresh={loadData}
            />
          )}
        </>
      );
    }

    if (isEisenhowerView) {
      return (
        <EisenhowerMatrix
          tasks={tasks.filter((t) => t.status !== "done" && t.status !== "someday")}
          onSelectTask={(task) => { setSelectedTask(task); }}
          onToggleTask={handleToggle}
        />
      );
    }

    if (isProjectView) {
      const projectId = parseInt(selectedView.split("-")[1]);
      return (
        <>
          <ProjectView
            projectId={projectId}
            onSelectTask={setSelectedTask}
            onRefresh={loadData}
          />
          {!isMobile && selectedTask && (
            <TaskDetail
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onRefresh={loadData}
            />
          )}
        </>
      );
    }

    if (isCalendarView) {
      return (
        <CalendarView
          tasks={tasks}
          onSelectTask={(task) => setSelectedTask(task)}
          onSelectDate={() => {}}
          onAddTask={(date) => setCalendarAddDate(date)}
        />
      );
    }

    // Default: task list views (inbox, today, next7, completed, list-*)
    return (
      <>
        <TaskListView
          title={viewTitle}
          tasks={filteredTasks}
          selectedTask={selectedTask}
          onSelectTask={setSelectedTask}
          onToggleTask={handleToggle}
          onTaskCreated={loadData}
        />
        {/* Desktop only: side panel */}
        {!isMobile && (
          selectedTask ? (
            <TaskDetail
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onRefresh={loadData}
            />
          ) : (
            <DayCalendar tasks={tasks} onSelectDate={() => {}} />
          )
        )}
      </>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <Sidebar
        selectedView={selectedView}
        onSelectView={handleSelectView}
        taskCounts={taskCounts}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mobile header */}
      <MobileHeader
        title={viewTitle}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {renderMainContent()}
      </div>

      {/* Mobile: TaskDetail as full-screen overlay */}
      {isMobile && selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onRefresh={loadData}
        />
      )}

      {/* Mobile: HabitDetail as full-screen overlay */}
      {isMobile && selectedHabit && isHabitsView && (
        <div className="fixed inset-0 z-40 bg-zinc-900">
          <HabitDetail
            habit={selectedHabit}
            onClose={() => setSelectedHabit(null)}
            onDelete={handleDeleteHabit}
            onToggleLog={handleToggleHabitLog}
          />
        </div>
      )}

      {/* Desktop: Calendar task detail overlay */}
      {!isMobile && isCalendarView && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40" onClick={() => setSelectedTask(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[80vh] overflow-y-auto">
            <TaskDetail
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onRefresh={loadData}
            />
          </div>
        </div>
      )}

      {/* Desktop: Eisenhower task detail */}
      {!isMobile && isEisenhowerView && selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onRefresh={loadData}
        />
      )}

      {/* Calendar add task modal */}
      {calendarAddDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40" onClick={() => setCalendarAddDate(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <AddTaskFromCalendar
              date={calendarAddDate}
              onCreated={() => { setCalendarAddDate(null); loadData(); }}
              onClose={() => setCalendarAddDate(null)}
            />
          </div>
        </div>
      )}

      {/* Mobile FAB */}
      {showFab && (
        <FloatingAddButton onClick={() => {
          if (isHabitsView) {
            setShowAddHabit(true);
          } else {
            setShowMobileAdd(true);
          }
        }} />
      )}

      {/* Mobile add task form */}
      {showMobileAdd && (
        <AddTaskForm
          onCreated={loadData}
          onClose={() => setShowMobileAdd(false)}
        />
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {/* Bottom tab bar */}
      <BottomTabBar
        selectedView={selectedView}
        onSelectView={handleSelectView}
      />
    </div>
  );
}

// Inline quick-add component for calendar
import { createTask } from "@/lib/api";

function AddTaskFromCalendar({ date, onCreated, onClose }: {
  date: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(4);

  async function handleSubmit() {
    if (!title.trim()) return;
    try {
      await createTask({ title: title.trim(), due_date: date, priority, status: "todo" } as Parameters<typeof createTask>[0]);
      onCreated();
    } catch {
      showToast("Errore nella creazione del task");
    }
  }

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 w-80 mx-4">
      <h3 className="text-sm font-medium text-white mb-3">Nuovo task - {date}</h3>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titolo task..."
        className="w-full bg-zinc-700 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none mb-3 placeholder-zinc-500"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onClose();
        }}
      />
      <div className="flex gap-2 mb-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                priority === p
                  ? p === 1 ? "bg-red-600 text-white" : p === 2 ? "bg-orange-600 text-white" : p === 3 ? "bg-yellow-600 text-white" : "bg-zinc-600 text-white"
                  : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300">
          Annulla
        </button>
        <button
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm text-white"
        >
          Crea
        </button>
      </div>
    </div>
  );
}
