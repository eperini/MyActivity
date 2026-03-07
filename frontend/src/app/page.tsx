"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Task, TaskList, Habit } from "@/types";
import {
  getTasks, getLists, updateTask, deleteTask,
  getHabits, getWeekLogs, toggleHabitLog, deleteHabit,
} from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import TaskListView from "@/components/TaskListView";
import TaskDetail from "@/components/TaskDetail";
import DayCalendar from "@/components/DayCalendar";
import HabitListView from "@/components/HabitListView";
import HabitDetail from "@/components/HabitDetail";
import AddHabitForm from "@/components/AddHabitForm";
import EisenhowerMatrix from "@/components/EisenhowerMatrix";
import PomodoroTimer from "@/components/PomodoroTimer";
import PomodoroHistory from "@/components/PomodoroHistory";
import CalendarView from "@/components/CalendarView";
import ShareListModal from "@/components/ShareListModal";
import StatsView from "@/components/StatsView";
import SettingsView from "@/components/SettingsView";
import { isToday, parseISO, differenceInDays } from "date-fns";

export default function HomePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [selectedView, setSelectedView] = useState("inbox");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  // Habits state
  const [habits, setHabits] = useState<Habit[]>([]);
  const [weekLogs, setWeekLogs] = useState<Record<number, string[]>>({});
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [pomodoroRefreshKey, setPomodoroRefreshKey] = useState(0);

  // Calendar add task
  const [calendarAddDate, setCalendarAddDate] = useState<string | null>(null);

  // Share list
  const [shareList, setShareList] = useState<TaskList | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([getTasks(), getLists()]);
      setTasks(t);
      setLists(l);
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
      console.error("Failed to load habits");
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    loadData();
  }, [loadData, router]);

  // Load habits when switching to habits view
  useEffect(() => {
    if (selectedView === "habits") {
      loadHabits();
    }
  }, [selectedView, loadHabits]);

  // Clear task selection when switching to habits, and vice versa
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

  // Filter tasks based on selected view
  const filteredTasks = tasks.filter((task) => {
    if (task.status === "done" && selectedView !== "completed") return false;

    switch (selectedView) {
      case "today":
        return task.due_date && isToday(parseISO(task.due_date));
      case "next7":
        if (!task.due_date) return false;
        const diff = differenceInDays(parseISO(task.due_date), new Date());
        return diff >= 0 && diff <= 7;
      case "inbox":
        return task.status !== "done";
      case "completed":
        return task.status === "done";
      default:
        if (selectedView.startsWith("list-")) {
          const listId = parseInt(selectedView.split("-")[1]);
          return task.list_id === listId;
        }
        return true;
    }
  });

  // Count tasks per view
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const taskCounts: Record<string, number> = {
    today: activeTasks.filter((t) => t.due_date && isToday(parseISO(t.due_date))).length,
    next7: activeTasks.filter((t) => {
      if (!t.due_date) return false;
      const diff = differenceInDays(parseISO(t.due_date), new Date());
      return diff >= 0 && diff <= 7;
    }).length,
    inbox: activeTasks.length,
    habits: habits.length,
  };
  lists.forEach((l) => {
    taskCounts[`list-${l.id}`] = activeTasks.filter((t) => t.list_id === l.id).length;
  });

  // View title
  const viewTitles: Record<string, string> = {
    today: "Oggi",
    next7: "Prossimi 7 Giorni",
    inbox: "Inbox",
    completed: "Completati",
  };
  const viewTitle = selectedView.startsWith("list-")
    ? lists.find((l) => l.id === parseInt(selectedView.split("-")[1]))?.name || "Lista"
    : viewTitles[selectedView] || "Task";

  async function handleToggle(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done";
    try {
      await updateTask(task.id, { status: newStatus });
      if (selectedTask?.id === task.id) {
        setSelectedTask({ ...task, status: newStatus as Task["status"] });
      }
      loadData();
    } catch {
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
    } catch {
      loadData();
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id);
      setSelectedTask(null);
      loadData();
    } catch {
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
    } catch {
      setWeekLogs(prevLogs);
    }
  }

  async function handleDeleteHabit(id: number) {
    try {
      await deleteHabit(id);
      setSelectedHabit(null);
      loadHabits();
    } catch {
      loadHabits();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Caricamento...</div>
      </div>
    );
  }

  const selectedList = selectedTask
    ? lists.find((l) => l.id === selectedTask.list_id)
    : undefined;

  const isHabitsView = selectedView === "habits";
  const isEisenhowerView = selectedView === "eisenhower";
  const isCalendarView = selectedView === "calendar";
  const isStatsView = selectedView === "stats";
  const isSettingsView = selectedView === "settings";

  function renderMainContent() {
    if (isStatsView) {
      return <StatsView />;
    }

    if (isSettingsView) {
      return <SettingsView />;
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
          {selectedHabit ? (
            <HabitDetail
              habit={selectedHabit}
              onClose={() => setSelectedHabit(null)}
              onDelete={handleDeleteHabit}
              onToggleLog={handleToggleHabitLog}
            />
          ) : (
            <DayCalendar tasks={tasks} onSelectDate={() => {}} />
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
          <PomodoroHistory refreshKey={pomodoroRefreshKey} />
        </>
      );
    }

    if (isEisenhowerView) {
      return (
        <>
          <EisenhowerMatrix
            tasks={tasks.filter((t) => t.status !== "done")}
            lists={lists}
            onSelectTask={(task) => { setSelectedTask(task); }}
            onToggleTask={handleToggle}
          />
          {selectedTask && (
            <TaskDetail
              task={selectedTask}
              list={selectedList}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </>
      );
    }

    if (isCalendarView) {
      return (
        <CalendarView
          tasks={tasks}
          lists={lists}
          onSelectTask={(task) => setSelectedTask(task)}
          onSelectDate={() => {}}
          onAddTask={(date) => setCalendarAddDate(date)}
        />
      );
    }

    return (
      <>
        <TaskListView
          title={viewTitle}
          tasks={filteredTasks}
          lists={lists}
          selectedTask={selectedTask}
          defaultListId={
            selectedView.startsWith("list-")
              ? parseInt(selectedView.split("-")[1])
              : lists[0]?.id
          }
          onSelectTask={setSelectedTask}
          onToggleTask={handleToggle}
          onTaskCreated={loadData}
        />
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            list={selectedList}
            onClose={() => setSelectedTask(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ) : (
          <DayCalendar tasks={tasks} onSelectDate={() => {}} />
        )}
      </>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-white flex">
      <Sidebar
        lists={lists}
        selectedView={selectedView}
        onSelectView={handleSelectView}
        taskCounts={taskCounts}
        onListCreated={loadData}
        onShareList={setShareList}
      />
      {renderMainContent()}

      {/* Calendar task detail overlay */}
      {isCalendarView && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40" onClick={() => setSelectedTask(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[80vh] overflow-y-auto">
            <TaskDetail
              task={selectedTask}
              list={selectedList}
              onClose={() => setSelectedTask(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          </div>
        </div>
      )}

      {/* Share list modal */}
      {shareList && (
        <ShareListModal
          list={shareList}
          onClose={() => setShareList(null)}
        />
      )}

      {/* Calendar add task modal */}
      {calendarAddDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40" onClick={() => setCalendarAddDate(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <AddTaskFromCalendar
              date={calendarAddDate}
              lists={lists}
              onCreated={() => { setCalendarAddDate(null); loadData(); }}
              onClose={() => setCalendarAddDate(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Inline quick-add component for calendar
import { createTask } from "@/lib/api";

function AddTaskFromCalendar({ date, lists, onCreated, onClose }: {
  date: string;
  lists: TaskList[];
  onCreated: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [listId, setListId] = useState(lists[0]?.id);
  const [priority, setPriority] = useState(4);

  async function handleSubmit() {
    if (!title.trim() || !listId) return;
    try {
      await createTask({ title: title.trim(), list_id: listId, due_date: date, priority, status: "todo" } as Parameters<typeof createTask>[0]);
      onCreated();
    } catch {
      console.error("Failed to create task");
    }
  }

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 w-80">
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
        <select
          value={listId}
          onChange={(e) => setListId(Number(e.target.value))}
          className="flex-1 bg-zinc-700 text-sm text-zinc-300 rounded-lg px-2 py-1.5 outline-none"
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
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
