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
import { isToday, parseISO, differenceInDays, format } from "date-fns";

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
      // Reload to restore consistent state
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
    // Optimistic update for week logs
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
      // Rollback on error
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

  function renderMainContent() {
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
      />
      {renderMainContent()}
    </div>
  );
}
