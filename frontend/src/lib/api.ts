import type { Task, TaskList, Habit, HabitLog, HabitStats, RecurrenceRule, TaskInstance, PomodoroSession, PomodoroStats } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Non autorizzato");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Errore sconosciuto" }));
    throw new Error(error.detail || "Errore API");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export async function login(email: string, password: string) {
  const data = await request<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("token", data.access_token);
  return data;
}

export async function register(email: string, password: string, display_name: string) {
  const data = await request<{ access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, display_name }),
  });
  localStorage.setItem("token", data.access_token);
  return data;
}

// Lists
export const getLists = () => request<TaskList[]>("/lists/");
export const createList = (data: { name: string; color?: string }) =>
  request<TaskList>("/lists/", { method: "POST", body: JSON.stringify(data) });
export const updateList = (id: number, data: { name?: string; color?: string }) =>
  request<TaskList>(`/lists/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteList = (id: number) =>
  request<{ detail: string }>(`/lists/${id}`, { method: "DELETE" });

// Tasks
export const getTasks = (params?: { list_id?: number; status?: string }) => {
  const query = new URLSearchParams();
  if (params?.list_id) query.set("list_id", String(params.list_id));
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return request<Task[]>(`/tasks/${qs ? `?${qs}` : ""}`);
};

export const createTask = (data: Partial<Task>) =>
  request<Task>("/tasks/", { method: "POST", body: JSON.stringify(data) });

export const updateTask = (id: number, data: Partial<Task>) =>
  request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteTask = (id: number) =>
  request<{ detail: string }>(`/tasks/${id}`, { method: "DELETE" });

// Recurrences
export const setRecurrence = (taskId: number, data: {
  frequency: string;
  interval?: number;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  month?: number | null;
  nth_weekday?: number | null;
  nth_weekday_day?: number | null;
  workday_adjust?: string;
  workday_target?: number | null;
}) =>
  request<RecurrenceRule>(`/tasks/${taskId}/recurrence`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getRecurrence = (taskId: number) =>
  request<RecurrenceRule>(`/tasks/${taskId}/recurrence`);

export const deleteRecurrence = (taskId: number) =>
  request<{ detail: string }>(`/tasks/${taskId}/recurrence`, { method: "DELETE" });

export const getRecurrencePreview = (taskId: number, count = 5) =>
  request<{ dates: string[] }>(`/tasks/${taskId}/recurrence/preview?count=${count}`);

export const getInstances = (taskId: number) =>
  request<TaskInstance[]>(`/tasks/${taskId}/instances`);

// Habits
export const getHabits = () => request<Habit[]>("/habits/");
export const createHabit = (data: Partial<Habit>) =>
  request<Habit>("/habits/", { method: "POST", body: JSON.stringify(data) });
export const updateHabit = (id: number, data: Partial<Habit>) =>
  request<Habit>(`/habits/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteHabit = (id: number) =>
  request<{ detail: string }>(`/habits/${id}`, { method: "DELETE" });
export const toggleHabitLog = (habitId: number, logDate: string) =>
  request<{ checked: boolean }>(`/habits/${habitId}/toggle`, {
    method: "POST",
    body: JSON.stringify({ log_date: logDate }),
  });
export const getHabitLogs = (habitId: number, year: number, month: number) =>
  request<HabitLog[]>(`/habits/${habitId}/logs?year=${year}&month=${month}`);
export const getHabitStats = (habitId: number) =>
  request<HabitStats>(`/habits/${habitId}/stats`);
export const getWeekLogs = () =>
  request<Record<number, string[]>>("/habits/logs/week");

// Pomodoro
export const createPomodoroSession = (data: {
  task_id?: number | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  session_type?: string;
}) =>
  request<PomodoroSession>("/pomodoro/", { method: "POST", body: JSON.stringify(data) });
export const getPomodoroSessions = () =>
  request<PomodoroSession[]>("/pomodoro/");
export const getPomodoroStats = () =>
  request<PomodoroStats>("/pomodoro/stats");
